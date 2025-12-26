const express=require('express');
const app=express();
const dotenv=require('dotenv');
dotenv.config();
const cors=require('cors');
const connectDB=require('./config/db');
const paytmRoutes=require('./routers/paytmroute');

app.use(express.json());
app.use(cors());

app.use('/api',paytmRoutes);

app.get('/',(req,res)=>{
    res.send('this is the paytm payment server');
});

const PORT=process.env.PORT;

connectDB().then(()=>{
    app.listen(PORT,()=>{
        console.log(`Server is running on PORT ${PORT}`);
    });
})

