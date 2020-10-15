const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const { convertArrayToCSV } = require('convert-array-to-csv');
const fs = require('fs');
const PDFDocument = require('pdfkit');
admin.initializeApp();

// const gmailEmail = functions.config().gmail.email;
// const gmailPassword = functions.config().gmail.password;
// let transporter = nodemailer.createTransport({
//     service: "gmail",
//     auth: {
//         user: gmailEmail,
//         pass: gmailPassword
//     }
// });

// exports.emailSender = functions.https.onRequest((req, res) => {

//     const mailOptions = {
//         from: 'ercuesy@gmail.com', //Adding sender's email
//         to: req.query.dest, //Getting recipient's email by query string
//         subject: 'Email Sent via Firebase',
//         text: 'Some text',//Email subject
//         html: '<b>Sending emails with Firebase is easy!</b>',
//     };

//     return transporter.sendMail(mailOptions, (err, info) => {
//         if(err){
//             return res.send(err.toString());
//         }
//         return res.send('Email sent successfully');
//     });

// });

function createInvoice(invoice, path) {
    let doc = new PDFDocument({ margin: 50 });

    generateHeader(doc);
    generateCustomerInformation(doc, invoice);
    generateInvoiceTable(doc, invoice);
    generateFooter(doc);

    doc.end();
    doc.pipe(fs.createWriteStream(path));
}

function generateHeader(doc) {
    doc
      .image("NMlogo.png", 50, 45, { width: 50 })
      .fillColor("#444444")
      .fontSize(20)
      .text("Invoice", 110, 57)
      .fontSize(10)
      .text("229 Lonehill Village Estate", 200, 65, { align: "right" })
      .text("Lonehill, 2091, South Africa", 200, 80, { align: "right" })
      .moveDown();
  }
  
function generateFooter(doc) {
    doc
        .fontSize(10)
        .text(
        "Payment is due within 7 days. Thank you for your business.",
        50,
        780,
        { align: "center", width: 500 }
        );
}

function generateCustomerInformation(doc, invoice) {
    const shipping = invoice.shipping;
    const balanceDue = new Intl.NumberFormat('en-ZA', {style: 'currency', currency: 'ZAR'}).format((invoice.subtotal - invoice.paid) * 0.01);
  
    doc
      .text(`Invoice Number: ${invoice.invoice_nr}`, 50, 150)
      .text(`Invoice Date: ${invoice.date}`, 50, 165)
      .text(`Balance Due: ${balanceDue}`, 50, 130)
  
    //   .text(shipping.name, 300, 200)
    //   .text(shipping.address, 300, 215)
    //   .text(`${shipping.city}, ${shipping.state}, ${shipping.country}`, 300, 130)
      .text('Restaurant manager name here', 300, 150)
      .text('Restaurant manager address here', 300, 165)
      .text(`City, Province, ZA`, 300, 130)
      .moveDown();
}

function generateTableRow(doc, y, c1, c2, c3) {
    doc
        .fontSize(10)
        .text(c1, 50, y)
        .text(c2, 150, y)
        .text(c3, 280, y, { width: 90, align: "right" });
}

function generateTableHeader(doc, pageNumber) {
    let firstRow = 200;
    if (pageNumber > 1) {
        firstRow = 130;
    }
    doc
        .fontSize(10)
        .text('Date', 50, firstRow)
        .text('Order number', 150, firstRow)
        .text('Amount', 280, firstRow, { width: 90, align: "center" });
}

function generateInvoiceTable(doc, invoice) {
    let i = 0;
    let rowCounter = 0;
    let pageCounter = 1;
    let invoiceTableTop = 200;
  
    generateTableHeader(doc, pageCounter);
    for (i = 0; i < invoice.items.length; i++) {
      const item = invoice.items[i];
      if (pageCounter > 1) {
        invoiceTableTop = 130;
      }
      const position = invoiceTableTop + (rowCounter + 1) * 15;
      generateTableRow(
        doc,
        position,
        item.orderDate,
        item.orderNumber,
        new Number(item.orderSubtotal).toFixed(2),
      );
      rowCounter++;
      if (pageCounter > 1) {
        if (rowCounter > 35) {
            rowCounter = 0;
            pageCounter++;
            doc.addPage();
            generateTableHeader(doc, pageCounter);
        }  
      } else {
        if (rowCounter > 30) {
            rowCounter = 0;
            pageCounter++;
            doc.addPage();
            generateTableHeader(doc, pageCounter);
        }  
      }
    }
}
  
exports.queryCollection = functions.https.onRequest(async (request, response) => {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();
    console.log('Current YM: ', currentYear, currentMonth);
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    console.log('First, last days: ', firstDay, lastDay);
    const fdMil = firstDay.valueOf();
    const ldMil = lastDay.valueOf();
    //console.log('Milis: ', fdMil, ldMil);
    //console.log('Date range: ', firstDay.getFullYear(), firstDay.getMonth() + 1, firstDay.getDate(), lastDay.getFullYear(), lastDay.getMonth() + 1, lastDay.getDate());
    const collectionReference = admin.firestore().collection('orders').where('timestamp', '>=', fdMil).where('timestamp', '<=', ldMil).where('status','==', 13);
    await collectionReference.get().then((snapshot) => {
        let orderDataArray = [];
        let myInvoice = new Map();
        if (!snapshot.empty) {
            let orderDataLine = new Map();
            myInvoice['restaurantName'] = 'Restaurant name';
            myInvoice['invoice_nr'] = 1;
            myInvoice['date'] = currentYear + '/' + currentMonth;
            let invoiceTotal = 0;
            snapshot.forEach(order => {
                const orderDataMap = order.data();
                let orderItems = orderDataMap['orderItems'];
                let orderSubTotal = 0.0;
                for (let i = 0; i < orderItems.length; i++) {
                    orderSubTotal = orderSubTotal + parseFloat(orderItems[i]['lineTotal']);
                }
                let orderDate = new Date(orderDataMap['timestamp']);
                let orderYear = orderDate.getFullYear();
                let orderMonth = orderDate.getMonth() + 1;
                let orderDay = orderDate.getDate();
                orderDataLine = {
                    restaurantName: orderDataMap['restaurantName'],
                    orderDate: orderYear + '/' + orderMonth + '/' + orderDay,
                    orderNumber: orderDataMap['orderNumber'],
                    orderSubtotal: orderSubTotal,
                    tip: orderDataMap['tip'],
                    discount: orderDataMap['discount'],
                    orderTotal: orderSubTotal - (orderSubTotal * orderDataMap['discount']) + orderDataMap['tip']
                };
                invoiceTotal = invoiceTotal + orderSubTotal;
                orderDataArray.push(orderDataLine);
            });
            myInvoice['items'] = orderDataArray;
            myInvoice['subtotal'] = invoiceTotal;
            myInvoice['paid'] = 0;
        } else {
            console.log('No data!');
        }
        //console.log('Subtotal: ', myInvoice['subtotal']);
        //console.log('Items: ', myInvoice['items']);
        createInvoice(myInvoice, 'NMinvoice.pdf');
        const csvData = convertArrayToCSV(orderDataArray);
        response.setHeader(
            'Content-disposition',
            "attachment; filename=NM_DBextract.csv"
        );
        response.set('Content-type', 'text/csv');
        return response.status(200).send(csvData);
    }).catch((error) => {
        return console.log(error);
    });
});

