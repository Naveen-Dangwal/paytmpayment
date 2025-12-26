const express=require('express');
const router=express.Router();
const {initiate,callback,paymentStatus,payments,transactionStatus}=require('../controllers/paytmcontroller');

router.post('/initiate',initiate); // to initiate the payment
router.post('/callback',callback); // after the payment is done in the paytm webhook
router.get('/status/:orderId',paymentStatus) // to get the payment status based on the orderid
router.get('/payments',payments);
router.get('/transaction-status',transactionStatus);

module.exports=router;