const axios=require('axios');
const PaytmChecksum=require('paytmchecksum');
const Payment=require('../models/payment');
const PaytmConfig=require('../config/paytm');
const {sendSuccessResponse, sendErrorResponse, sendValidationResponse}=require('../utlis/response');


// 1. function for initating the payment 
const initiate=async(req,res)=>{
    try {
        const { amount, customerEmail, customerPhone, customerName}=req.body;

        if(!amount || !customerEmail || customerPhone || customerName){
            return res.status(500).json({
                success:false,
                message,
                error:error?error.message:null,
                timestamp:new Date().toISOString()
            })

            // generate unique order id 
            const orderId=`ORDER_${Date.now()}_${Math.random().toString(36).substr(2,9)}`;

            // create payment  record in the database
            const payment=new Payment({
                orderId,
                amount:parseFloat(amount),
                customerEmail,
                customerPhone,
                customerName,
                status:'PENDING'
            });

            await payment.save();

            //prepare paytm parameters 
            const paytmParams={
                MID: PaytmConfig.MID,
                WEBSITE: PaytmConfig.WEBSITE,
                CHANNEL_ID: PaytmConfig.CHANNEL_ID,
                INDUSTRY_TYPE_ID: PaytmConfig.INDUSTRY_TYPE_ID,
                ORDER_ID: orderId,
                CUST_ID: customerEmail,
                TXN_AMOUNT: parseFloat(amount).toFixed(2),
                CALLBACK_URL: PaytmConfig.CALLBACK_URL,
                EMAIL: customerEmail,
                MOBILE_NO: customerPhone
            }

            // generate checksum
            const checksum=await PaytmChecksum.generateSignature(paytmParams,PaytmConfig.MERCHANT_KEY);
            paytmParams.CHECKSUMHASH=checksum;

            //update payment record with checksum
            await Payment.findOneAndUpdate(
                {orderId},
                {
                  checksumHash:checksum,
                  paytmOrderId:orderId,
                  updatedAt:new Date()
                }
            );

            console.log('Payment initiated:',{orderId,amount:paytmParams.TXN_AMOUNT,customerEmail});

            return res.status(200).json({
                orderId,
                paytmParams,
                PaytmUrl:PaytmConfig.PAYTM_URL,
            })
        }
        
    } catch (error) {
        console.error('Payment initiation error ',error);
        return res.status(400).json({
            success:false,
            message:'Payment initiation failed'
        })
    }
}


// 2. payment callback handler

const callback=async(req,res)=>{
    try {
        const paytmResponse=req.body;
        const orderId= paytmResponse.ORDERID;

        console.log('Received Paytm callback',paytmResponse);

        // verify checksum
        let isValidChecksum=true;
        if(paytmResponse.CHECKSUMHASH){
            isValidChecksum=PaytmChecksum.verifySignature(paytmResponse, PaytmConfig.MERCHANT_KEY,paytmResponse.CHECKSUMHASH);   
        }

        // determine payment status
        let paymentStatus='FAILED';
        if(paytmResponse.STATUS === 'TXN_SUCCESS'){
            paymentStatus='SUCCESS';
        }
        else if(paytmResponse.STATUS === 'TXN_FAILURE'){
            paymentStatus='FAILED';
        }
        else if(paytmResponse.STATUS === 'PENDING'){
            paymentStatus='PENDING';
        }

        // update payment status in database
        const updateData={
            status:paymentStatus,
            transactionId: paytmResponse.TXNID || paytmResponse.ORDERID,
            paytmTxnId:paytmResponse.TXNID,
            paytmResponse: paytmResponse,
            paymentMode: paytmResponse.PAYMENTMODE,
            bankName: paytmResponse.BANKNAME,
            bankTxbId: paytmResponse.BANKTXNID,
            responseCode: paytmResponse.RESPCODE,
            responseMsg: paytmResponse.RESPMSG,
            updatedAt: new Date()
        };

        const payment = await Payment.findOneAndUpdate(
            {orderId},
            updateData,
            {new:true}
        );

        if(!payment){
            return res.status(404).json({message:'Payment record not found'})
        }

        console.log('Payment updated:',{orderId, status:paymentStatus, checksumValid:isValidChecksum});

        // return JSON response instead of HMTl redirect
        return res.status(200).json({
            orderId,
            status:paymentStatus,
            transactionId: updateData.transactionId,
            responseCode:paytmResponse.RESPCODE,
            responseMsg:paytmResponse.RESPMSG,
            checksumValid:isValidChecksum,
        });
    } 
    
    catch (error) {
        console.error('Payment callback error:',error);
        return res.status(404).json({message:error});
    }
}


// 3 check the payment status based on the order id 

const paymentStatus=async(req,res)=>{
    try {
        const { orderId }=req.params;

        const payment = await Payment.findOne({orderId});

        if(!payment){
            return res.status(404).json({message:'payment not found'});
        }

        return res.status(200).json({
            orderId : payment.orderId,
            amount : payment.amount,
            status : payment.status,
            transactionId : payment.transactionId,
            customerEmail : payment.customerEmail,
            customerName : payment.customerName,
            paymentMode : payment.paymentMode,
            bankName : payment.bankName,
            responseCode : payment.responseCode,
            responseMsg : payment.responseMsg,
            createdAt : payment.createdAt,
            updatedAt : payment.createdAt
        })
    } 
    catch (error) {
        console.error('status check error');
        res.status(400).json({message:'status check failed'});
    }
}

// 4. Get all the payment (Admin)

const payments=async(req,res)=>{
    try {
        const { page = 1, limit = 10, status}=req.query;

        const filter={};
        if(status) filter.status=status;
        
        const payments=await Payment.find(filter).sort({createdAt:-1}).limit(limit * 1).skip((page-1)*limit).select('-paytmResponse - checksunHash');

        const total=await Payment.countDocuments(filter);

        return res.status(200).json({
            payments,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / limit),
                totalRecords:total,
                limit:parseInt(limit)
            },
            message:'payment retrieved successfully'
        });

    } catch (error) {
        console.error('Get payments error',error);
        
    }
}

// 5. Transaction status inquiry

const transactionStatus=async(req,res)=>{
    try {
        const {orderId}=req.body;

        if(!orderId){
            return res.stauts(200).json({message:'order id is required'});
        }

        const statusParams={
            MID:PaytmConfig.MID,
            ORDERID:orderId
        };

        const checksum = await PaytmChecksum.generateSignature(statusParams, PaytmConfig.MERCHANT_KEY);
        statusParams.CHECKSUMHASH=checksum;

        const response=await axios.post(PaytmConfig.STATUS_URL,statusParams,{
            headers:{
                'Content-Type':'application/json'
            }
        });

        console.log('Paytm status response: ',response.data);
        return res.status(200).json({
            response:response.data,
            message:'Transaction status retrived successfully'
        });
    } 
    catch (error) {
        console.log('Transaction status inquiry error',error);
        return res.status(404).json({
            message:'failed to check the transaction status'
        });
    }
}

module.exports={initiate,callback,paymentStatus,payments,transactionStatus};
