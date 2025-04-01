import { ClobClient, OrderType, Side } from '@polymarket/clob-client';
import { TradeData, TradeParams } from '../interfaces/tradeInterfaces';
import getMyBalance from '../utils/getMyBalance';
import { parseArgs } from 'util';

const tradeExecutor = async (clobClient: ClobClient, data: TradeData, params: TradeParams) => {
    
    const side = data.side ? Side.SELL : Side.BUY;
    const tokenID = data.tokenId;
    const cost = data.side ? data.takerAmount : data.makerAmount;
    let price = data.side
    ? data.takerAmount / data.makerAmount
    : data.makerAmount / data.takerAmount;
    let size = cost / price * params.copyRatio + 0.01;
    let orderId = "";
    //get market info from clob
    // const marketInfo = await clobClient.getMarket(tokenID);
    // const conditionId =  marketInfo.conditionId;

    const currentTime = new Date().toISOString().slice(11, 16);
    
    
    const newTradeData = {
        "CST": currentTime,
        "Copied Transaction Hash": data.transactionHash,
        "Buy or Sell?": side,
        // "Contest Title": "Chiefs vs Eagles",
        // "Outcome Bet on": "Chiefs",
        "Copied User Price Per share": price,
        "Copied User # of shares": cost / price,
        "Copied User Cost": cost,
    }
    console.log('Trade Data:', JSON.stringify(newTradeData, null, 2));
    if (size < 5) {
        size = 5;
        // console.log('size too small, reset size as 5');
    }
    if (size * price < 1) {
        // console.log('value too small, skipping execution.');
        size = 1 / price + 0.01;
        // console.log(`reset size as ${size}=1/${price}`);
        // return;    
    }

    const executeOrder = async (price: number, size: number, timeout: number): Promise<boolean> => {
        try {
            const orderArgs = { side, tokenID, size, price };
            const originalConsoleError = console.error;
            // Suppress console.error to avoid cluttering the output

            console.error = function () { };
            const order = await clobClient.createOrder(orderArgs);
            console.error = originalConsoleError;
            // console.log('Created order 🎉:', order);

            console.error = function () { };
            const response = await clobClient.postOrder(order, OrderType.GTC);
            console.error = originalConsoleError;
            // console.log('Order response:', response);

            if (!response.success) {
                // console.error('Order posting failed.');
                return false;
            }

            await new Promise((resolve) => setTimeout(resolve, timeout * 1000));
            console.error = function () { };
            const orderStatus = await clobClient.getOrder(response.orderID);
            console.error = originalConsoleError;
            if (orderStatus.original_size === orderStatus.size_matched) {
                orderId = response.orderID;
                return true;
            }
            
            await new Promise((resolve) => setTimeout(resolve, timeout * 1000));
            console.error = function () { };
            await clobClient.cancelOrder(response.orderID);
            console.error = originalConsoleError;
            // console.log('Order partially filled and canceled ❌:', response.orderID);
            return false;
        } catch (error) {
            // console.error('Error during order execution ❗:', error);
            return false;
        }
    };
    
    for (let attempt = 1; attempt <= params.retryLimit; attempt++) {
        // Attempt  order
        console.log(
            `✅ Attempt #${attempt}\n ${size} shares @ $${price}`
        );
        if (await executeOrder(price, size, params.orderTimeout)) {
            console.log('Successful? :   Yes');
            console.log(`Order completed successfully 🎉:   ${orderId}`);
            return;
        }
        console.log('Successful? :   No');
        price = data.side
            ? price - params.orderIncrement / 100
            : price + params.orderIncrement / 100;
        if (price < 0) {
            console.log('\nPrice too low, skipping execution.');
            break;
        }
        // size = size - size * (params.orderIncrement / 100);
    }

    console.log('🔥 All attempts failed.');
};

export default tradeExecutor;