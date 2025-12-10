// success response
const sendSuccessResponse=(res,data,message='Success',statusCode=200)=>{
    return res.status(statusCode).json({
        success:true,
        message,
        data,
        timestamp:new Date().toISOString()
    });
};

// error response
const sendErrorResponse=(res,message='Error',error=null,statusCode=500)=>{
    return res.status(statusCode).json({
        success:false,
        message,
        error:error?error.message:null,
        timestamp:new Date().toISOString()
    });
};

// validation response
const sendValidationResponse=(res,message='Validaton Error',statusCode=400)=>{
    return res.status(statusCode).json({
        success:false,
        message,
        timestamp:new Date().toISOString
    });
};

module.exports={sendSuccessResponse, sendErrorResponse, sendValidationResponse};