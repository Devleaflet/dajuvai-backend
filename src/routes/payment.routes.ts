import { Request, Response } from 'express';
import crypto from 'crypto';
import axios from 'axios';
import { Router } from 'express';
import { Order, OrderStatus, PaymentStatus } from '../entities/order.entity';
import AppDataSource from '../config/db.config';
import { APIError } from '../utils/ApiError.utils';
import { CartService } from '../service/cart.service';


const paymentRouter = Router();
const orderDb = AppDataSource.getRepository(Order);


const CONFIG = {
    MERCHANT_ID: '545',
    MERCHANT_NAME: 'dajuvaiapi',
    API_USERNAME: 'dajuvaiapi',
    API_PASSWORD: 'W#8rXp2!kL9z@Vm',
    SECRET_KEY: 'gT7$yMn#45v!QbA',
    BASE_URL: 'https://apigateway.nepalpayment.com',
    GATEWAY_URL: 'https://gateway.nepalpayment.com/',
};


// Generate HMAC SHA512 Signature
function generateSignature(data: Record<string, string>, secretKey: string): string {
    const sortedKeys = Object.keys(data).sort();
    const concatenatedValues = sortedKeys.map(key => data[key]).join('');
    const hmac = crypto.createHmac('sha512', secretKey);
    hmac.update(concatenatedValues, 'utf8');
    return hmac.digest('hex');
}

// Generate Basic Auth Header
function getAuthHeader(): string {
    const credentials = Buffer.from(`${CONFIG.API_USERNAME}:${CONFIG.API_PASSWORD}`).toString('base64');
    return `Basic ${credentials}`;
}

// 1. Get Payment Instruments
paymentRouter.get('/payment-instruments', async (_req: Request, res: Response) => {
    try {
        const requestData: Record<string, string> = {
            MerchantId: CONFIG.MERCHANT_ID,
            MerchantName: CONFIG.MERCHANT_NAME,
        };

        requestData.Signature = generateSignature(requestData, CONFIG.SECRET_KEY);

        const response = await axios.post(`${CONFIG.BASE_URL}/GetPaymentInstrumentDetails`, requestData, {
            headers: {
                Authorization: getAuthHeader(),
                'Content-Type': 'application/json'
            },
        });

        res.json(response.data);
    } catch (error: any) {
        console.error('Error getting payment instruments:', error.response?.data || error.message);
        res.status(500).json({ error: 'Failed to get payment instruments' });
    }
});

// 2. Get Service Charge
paymentRouter.post('/service-charge', async (req: Request, res: Response) => {
    try {
        const { amount, instrumentCode } = req.body;

        const requestData: Record<string, string> = {
            MerchantId: CONFIG.MERCHANT_ID,
            MerchantName: CONFIG.MERCHANT_NAME,
            Amount: amount.toString(),
            InstrumentCode: instrumentCode,
        };

        requestData.Signature = generateSignature(requestData, CONFIG.SECRET_KEY);

        const response = await axios.post(`${CONFIG.BASE_URL}/GetServiceCharge`, requestData, {
            headers: {
                Authorization: getAuthHeader(),
                'Content-Type': 'application/json',
            },
        });

        res.json(response.data);
    } catch (error: any) {
        console.error('Error getting service charge:', error.response?.data || error.message);
        res.status(500).json({ error: 'Failed to get service charge' });
    }
});

// 3. Get Process ID
paymentRouter.post('/process-id', async (req: Request, res: Response) => {
    try {
        const { amount, merchantTxnId } = req.body;

        const requestData: Record<string, string> = {
            MerchantId: CONFIG.MERCHANT_ID,
            MerchantName: CONFIG.MERCHANT_NAME,
            Amount: amount.toString(),
            MerchantTxnId: merchantTxnId,
        };

        requestData.Signature = generateSignature(requestData, CONFIG.SECRET_KEY);

        const response = await axios.post(`${CONFIG.BASE_URL}/GetProcessId`, requestData, {
            headers: {
                Authorization: getAuthHeader(),
                'Content-Type': 'application/json',
            },
        });

        res.json(response.data);
    } catch (error: any) {
        console.error('Error getting process ID:', error.response?.data || error.message);
        res.status(500).json({ error: 'Failed to get process ID' });
    }
});

// 4. Initiate Payment (Complete Flow)
paymentRouter.post('/initiate-payment', async (req: Request, res: Response) => {
    try {
        const { amount, instrumentCode, transactionRemarks, orderId } = req.body;
        console.log('Initiating payment for orderId:', orderId, 'amount:', amount);

        const merchantTxnId = `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        console.log('Generated merchantTxnId:', merchantTxnId);

        const processData: Record<string, string> = {
            MerchantId: CONFIG.MERCHANT_ID,
            MerchantName: CONFIG.MERCHANT_NAME,
            Amount: amount.toString(),
            MerchantTxnId: merchantTxnId,
        };

        processData.Signature = generateSignature(processData, CONFIG.SECRET_KEY);
        console.log('ProcessData before request:', processData);

        const processResponse = await axios.post(`${CONFIG.BASE_URL}/GetProcessId`, processData, {
            headers: {
                Authorization: getAuthHeader(),
                'Content-Type': 'application/json',
            },
        });

        console.log('Process response from eSewa:', processResponse.data);

        if (processResponse.data.code !== '0') {
            console.log('Failed to get process ID:', processResponse.data);
            res.status(400).json({ error: 'Failed to get process ID', details: processResponse.data });
            return;
        }

        const processId = processResponse.data.data.ProcessId;
        console.log('Received processId:', processId);

        const paymentData: Record<string, string> = {
            MerchantId: CONFIG.MERCHANT_ID,
            MerchantName: CONFIG.MERCHANT_NAME,
            Amount: amount.toString(),
            MerchantTxnId: merchantTxnId,
            ProcessId: processId,
            InstrumentCode: instrumentCode || '',
            TransactionRemarks: transactionRemarks || 'Payment via API',
            ResponseUrl: `https://dajuvai.com/order/payment-response`,
        };

        paymentData.Signature = generateSignature(paymentData, CONFIG.SECRET_KEY);
        console.log('PaymentData for frontend:', paymentData);

        const order = await orderDb.findOne({ where: { id: orderId } });
        if (!order) {
            throw new APIError(404, "Order not found");
        }

        // Update order with merchant transaction info
        order.mTransactionId = merchantTxnId;
        order.instrumentName = instrumentCode;
        // order.paymentStatus = PaymentStatus.PAID;
        // order.status = OrderStatus.CONFIRMED;

        await orderDb.save(order);
        console.log('Order updated with merchantTxnId:', order);

        res.json({
            success: true,
            paymentUrl: `${CONFIG.GATEWAY_URL}/Payment/Index`,
            formData: paymentData,
            merchantTxnId,
        });

    } catch (error) {
        console.error('Error in /initiate-payment:', error);
        if (error instanceof APIError) {
            res.status(error.status).json({ success: false, message: error.message });
        } else {
            res.status(500).json({ success: false, message: 'Internal server error' });
        }
    }
});


// 5. Check Transaction Status
paymentRouter.post('/check-status', async (req: Request, res: Response) => {
    try {
        const { merchantTxnId } = req.body;

        const requestData: Record<string, string> = {
            MerchantId: CONFIG.MERCHANT_ID,
            MerchantName: CONFIG.MERCHANT_NAME,
            MerchantTxnId: merchantTxnId,
        };

        requestData.Signature = generateSignature(requestData, CONFIG.SECRET_KEY);

        const response = await axios.post(`${CONFIG.BASE_URL}/CheckTransactionStatus`, requestData, {
            headers: {
                Authorization: getAuthHeader(),
                'Content-Type': 'application/json',
            },
        });

        res.json(response.data);
    } catch (error: any) {
        console.error('Error checking transaction status:', error.response?.data || error.message);
        res.status(500).json({ error: 'Failed to check transaction status' });
    }
});


// Response URL handler
paymentRouter.get('/response', (req: Request, res: Response) => {
    const { MerchantTxnId, GatewayTxnId } = req.query;

    res.redirect(`http://localhost:5174/?MerchantTxnId=${MerchantTxnId}&GatewayTxnId=${GatewayTxnId}`);
});

// https://api.dajuvai.com/api/payments/notification
// Notification URL (Webhook)   
// paymentRouter.get('/notification', async (req: Request, res: Response) => {
//     try {

//         const { MerchantTxnId, GatewayTxnId, Status } = req.query;

//         console.log(req.query);

//         console.log('Payment notification received:', {
//             MerchantTxnId,
//             GatewayTxnId,
//             timestamp: new Date().toISOString(),
//         });

//         if (!MerchantTxnId || typeof MerchantTxnId !== 'string') {
//             throw new APIError(400, "Invalid or missing MerchantTxnId")
//         }

//         const order = await orderDb.findOne({
//             where: {
//                 mTransactionId: MerchantTxnId
//             }
//         })
//         if (!order) {
//             throw new APIError(404, "Order not found")
//         }

//         const userId = order.orderedById;

//         order.paymentStatus = PaymentStatus.UNPAID;
//         order.status = OrderStatus.DELAYED;

//         const cartservice = new CartService();
//         await cartservice.clearCart(userId);

//         await orderDb.save(order);

//         res.send('received');
//     } catch (error) {
//         // Handle known API errors
//         if (error instanceof APIError) {
//             console.log(error);
//             res.status(error.status).json({ success: false, message: error.message });
//         } else {
//             res.status(500).json({ success: false, message: 'Internal server error' });
//         }
//     }
// });

paymentRouter.get('/notification', async (req: Request, res: Response) => {
    try {
        const { MerchantTxnId, GatewayTxnId, Status } = req.query;

        console.log('NPX Payment notification received:', req.query);
        console.log('Timestamp:', new Date().toISOString());

        if (!MerchantTxnId || typeof MerchantTxnId !== 'string') {
            throw new APIError(400, "Invalid or missing MerchantTxnId");
        }

        const order = await orderDb.findOne({
            where: { mTransactionId: MerchantTxnId }
        });

        if (!order) {
            throw new APIError(404, "Order not found");
        }

        const userId = order.orderedById;
        const cartService = new CartService();

        // Handle payment status
        switch ((Status as string).toUpperCase()) {
            case 'SUCCESS':
                order.paymentStatus = PaymentStatus.PAID;
                order.status = OrderStatus.CONFIRMED;
                await cartService.clearCart(userId); // Clear cart after successful payment
                console.log(`Order ${order.id} marked as PAID`);
                break;

            case 'FAILED':
            case 'CANCELLED':
                order.paymentStatus = PaymentStatus.UNPAID;
                order.status = OrderStatus.CANCELLED; 
                console.log(`Order ${order.id} marked as UNPAID due to ${Status}`);
                break;

            default:
                console.log(`Order ${order.id} received unknown status: ${Status}`);
                break;
        }

        await orderDb.save(order);

        res.send('received');
    } catch (error) {
        if (error instanceof APIError) {
            console.log(error);
            res.status(error.status).json({ success: false, message: error.message });
        } else {
            console.error('Internal server error in /notification:', error);
            res.status(500).json({ success: false, message: 'Internal server error' });
        }
    }
});



export default paymentRouter;