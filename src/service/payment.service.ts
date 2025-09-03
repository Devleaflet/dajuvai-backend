import { APIError } from '../utils/ApiError.utils';
import axios from 'axios';
import crypto from 'crypto';
import { Order, PaymentMethod } from '../entities/order.entity';

export class PaymentService {
    
    // Base URL for the Nepal Payment Gateway sandbox environment
    private baseUrl = 'https://merchantsandbox.nepalpayment.com/api/merchant/v2';

    // Merchant ID from environment variables or fallback default
    private merchantId = process.env.NPS_MERCHANT_ID || '7468';

    // API username for authenticating with Nepal Payment Gateway
    private apiUsername = process.env.NPS_API_USERNAME || 'leaflet';

    // API password for authenticating with Nepal Payment Gateway
    private apiPassword = process.env.NPS_API_PASSWORD || 'Leaflet@123';

    // Secret key used for generating secure hashes or signatures
    private secretKey = process.env.NPS_SECRET_KEY || 'Test@123Test';

    // Access code for identifying the merchant during API requests
    private accessCode = process.env.NPS_ACCESS_CODE || 'LFD100';



    /**
     * Initiates a payment transaction with the Nepal Payment Gateway.
     *
     * @param {Order} order - The order entity containing payment details.
     * @param {string} returnUrl - URL to redirect the user upon successful payment.
     * @param {string} cancelUrl - URL to redirect the user if payment is canceled.
     * @returns {Promise<{redirectUrl: string, transactionId: string}>} 
     *          An object containing the redirect URL for payment gateway and the transaction ID.
     * @throws {APIError} Throws APIError if configuration is missing, payment initiation fails,
     *                    or the response from payment gateway is invalid.
     * @access Public
     */
    async initiatePayment(order: Order, returnUrl: string, cancelUrl: string): Promise<{ redirectUrl: string, transactionId: string }> {
        // Ensure the base URL for the Nepal Payment Gateway is configured
        if (!process.env.NPG_BASE_URL) {
            throw new APIError(500, 'BASE_URL is not configured');
        }

        // Prepare payload data required by the payment API
        const payload = {
            merchantId: this.merchantId,               // Merchant identifier
            accessCode: this.accessCode,               // Access code for merchant
            amount: order.totalPrice,                   // Total payment amount
            currency: 'NPR',                            // Currency code
            orderId: order.id.toString(),               // Order identifier as string
            returnUrl,                                  // URL to redirect on successful payment
            cancelUrl,                                  // URL to redirect on payment cancellation
            customerEmail: order.orderedBy.email,       // Customer's email
            customerName: order.orderedBy.username,     // Customer's name
            // Use CASH_ON_DELIVERY only if payment method is COD; otherwise, ONLINE_PAYMENT
            paymentMethod: order.paymentMethod,
            timestamp: new Date().toISOString(),        // Current timestamp in ISO format
        };

        // Generate signature for payload authentication/security
        const signature = this.generateSignature(payload);
        payload['signature'] = signature;

        try {
            // Log the payload being sent to the payment API for debugging
            console.log('Initiating payment with payload:', payload);

            // Send POST request to the payment gateway's checkout endpoint with basic auth
            const response = await axios.post(`${this.baseUrl}/transactions/Checkout`, payload, {
                auth: {
                    username: this.apiUsername,
                    password: this.apiPassword,
                },
            });

            // Log the payment gateway response data
            console.log('Payment API response:', response.data);

            // Validate that response contains the expected redirectUrl and transactionId
            if (!response.data.redirectUrl || !response.data.transactionId) {
                throw new APIError(500, 'Failed to initiate payment: Missing redirectUrl or transactionId');
            }

            // Return the redirect URL for frontend redirection and transaction ID for tracking
            return {
                redirectUrl: response.data.redirectUrl,
                transactionId: response.data.transactionId,
            };
        } catch (error) {
            // Log detailed error info for troubleshooting
            console.error('Payment initiation error:', {
                message: error.message,
                response: error.response?.data,
                status: error.response?.status,
                headers: error.response?.headers,
            });

            // Throw a new APIError with relevant message from the error response or default
            throw new APIError(500, `Payment initiation failed: ${error.response?.data?.error || error.message}`);
        }
    }


    /**
     * Verifies the payment response by validating the signature and checking payment status.
     *
     * @param {string} transactionId - Unique transaction ID from the payment gateway.
     * @param {string} orderId - The order ID associated with the payment.
     * @param {any} responseData - Response data from the payment gateway, including status, amount, timestamp, and signature.
     * @returns {Promise<boolean>} Returns true if payment is successful and signature is valid.
     * @throws {APIError} Throws error if payment signature validation fails.
     * @access Public
     */
    async verifyPayment(transactionId: string, orderId: string, responseData: any): Promise<boolean> {
        // Prepare payload for signature verification, including essential payment details
        const payload = {
            merchantId: this.merchantId,
            transactionId,
            orderId,
            status: responseData.status,
            amount: responseData.amount,
            // Use the timestamp from response or current time if missing
            timestamp: responseData.timestamp || new Date().toISOString(),
        };

        // Generate the signature from the payload for comparison
        const signature = this.generateSignature(payload);

        // Verify that the signature matches the one received in responseData
        if (signature !== responseData.signature) {
            // Throw error if signature is invalid to prevent tampering
            throw new APIError(400, 'Invalid payment signature');
        }

        // Check if the payment status indicates success
        const isSuccessful = responseData.status === 'SUCCESS';

        // Return true if payment succeeded, otherwise false
        return isSuccessful;
    }

    /**
     * Generates a SHA-256 HMAC signature for the given payload.
     *
     * The signature is created by:
     *  - Sorting the payload keys alphabetically,
     *  - Concatenating them as key=value pairs joined by '&',
     *  - Appending the secret key,
     *  - Hashing the resulting string using SHA-256.
     *
     * @param {any} payload - The data object for which the signature is generated.
     * @returns {string} The generated hexadecimal SHA-256 signature.
     * @access Private
     */
    private generateSignature(payload: any): string {
        // Sort the payload keys alphabetically to ensure consistent ordering
        const sortedKeys = Object.keys(payload).sort();

        // Build the signature string by joining key=value pairs with '&' and appending the secret key
        const signatureString = sortedKeys
            .map(key => `${key}=${payload[key]}`)
            .join('&') + `&secretKey=${this.secretKey}`;

        // Generate SHA-256 hash of the signature string and return it as a hex digest
        return crypto.createHash('sha256').update(signatureString).digest('hex');
    }

    

    async esewaFailure(orderId:number){
        try{
            
        }catch(err){
            console.log("Error", err)
            throw new APIError(500, 'Esewa payment verification failed');
        }
    }

}