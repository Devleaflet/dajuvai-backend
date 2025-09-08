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
    MERCHANT_ID: '7468',
    MERCHANT_NAME: 'dajubhai',
    API_USERNAME: 'dajuvaiapi',
    API_PASSWORD: 'D@jubhai#765',
    SECRET_KEY: 'gT7$yMn#45v!QbA',
    BASE_URL: 'https://apisandbox.nepalpayment.com',
    GATEWAY_URL: 'https://gatewaysandbox.nepalpayment.com/payment/index',
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

        const merchantTxnId = `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const processData: Record<string, string> = {
            MerchantId: CONFIG.MERCHANT_ID,
            MerchantName: CONFIG.MERCHANT_NAME,
            Amount: amount.toString(),
            MerchantTxnId: merchantTxnId,
        };

        processData.Signature = generateSignature(processData, CONFIG.SECRET_KEY);

        const processResponse = await axios.post(`${CONFIG.BASE_URL}/GetProcessId`, processData, {
            headers: {
                Authorization: getAuthHeader(),
                'Content-Type': 'application/json',
            },
        });

        if (processResponse.data.code !== '0') {
            res.status(400).json({ error: 'Failed to get process ID', details: processResponse.data });
            return
        }

        const processId = processResponse.data.data.ProcessId;

        const paymentData: Record<string, string> = {
            MerchantId: CONFIG.MERCHANT_ID,
            MerchantName: CONFIG.MERCHANT_NAME,
            Amount: amount.toString(),
            MerchantTxnId: merchantTxnId,
            ProcessId: processId,
            InstrumentCode: instrumentCode || '',
            TransactionRemarks: transactionRemarks || 'Payment via API',
            // ResponseUrl: `http://localhost:5173/order/payment-response`,
            ResponseUrl: `https://dajuvai.com/order/payment-response`,
        };

        paymentData.Signature = generateSignature(paymentData, CONFIG.SECRET_KEY);


        const order = await orderDb.findOne({
            where: {
                id: orderId
            }
        })

        if (!order) {
            throw new APIError(404, "Order not found")
        }

        // Update with payment info
        order.mTransactionId = merchantTxnId;
        order.instrumentName = instrumentCode;

        await orderDb.save(order);

        res.json({
            success: true,
            paymentUrl: `${CONFIG.GATEWAY_URL}/Payment/Index`,
            formData: paymentData,
            merchantTxnId: merchantTxnId,
        });
    } catch (error) {
        // Handle known API errors
        if (error instanceof APIError) {
            console.log(error);
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

https://api.dajuvai.com/api/payments/notification
// Notification URL (Webhook)   
paymentRouter.get('/notification', async (req: Request, res: Response) => {
    try {

        const { MerchantTxnId, GatewayTxnId } = req.query;

        console.log('Payment notification received:', {
            MerchantTxnId,
            GatewayTxnId,
            timestamp: new Date().toISOString(),
        });

        if (!MerchantTxnId || typeof MerchantTxnId !== 'string') {
            throw new APIError(400, "Invalid or missing MerchantTxnId")
        }

        const order = await orderDb.findOne({
            where: {
                mTransactionId: MerchantTxnId
            }
        })
        if (!order) {
            throw new APIError(404, "Order not found")
        }

        const userId = order.orderedById;

        order.paymentStatus = PaymentStatus.PAID;
        order.status = OrderStatus.CONFIRMED;

        const cartservice = new CartService();
        await cartservice.clearCart(userId);

        await orderDb.save(order);

        res.send('received');
    } catch (error) {
        // Handle known API errors
        if (error instanceof APIError) {
            console.log(error);
            res.status(error.status).json({ success: false, message: error.message });
        } else {
            res.status(500).json({ success: false, message: 'Internal server error' });
        }
    }
});


export default paymentRouter;