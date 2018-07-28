import TronUtils from 'TronUtils';
import Logger from 'lib/logger';
import Utils from 'lib/utils';

import { WALLET_STATUS } from 'lib/constants';

const logger = new Logger('wallet');
const rpc = new TronUtils.rpc();

export default class Wallet {
    constructor() {
        this._walletStatus = WALLET_STATUS.UNINITIALIZED;

        this._accounts = {};
        this._password = false;
        this._currentAccount = false;

        this._loadWallet();
    }

    _loadWallet() {
        this._storage = Utils.loadStorage();

        if(this._storage.hasOwnProperty('encrypted'))
            this._walletStatus = WALLET_STATUS.LOCKED;
    }

    saveStorage(password = false) {
        if (!this._password && !password)
            throw 'Storage requires a password for encryption';

        this._storage.encrypted = Utils.encrypt(JSON.stringify(this._storage.decrypted), this._password || password);

        if(!this._password)
            this._password = password;

        logger.info('Saving storage');
        logger.info('-> Storing:', this._storage.encrypted);
        
        Utils.saveStorage({ encrypted: this._storage.encrypted });
    }

    getAccounts() {
        if(this._walletStatus === WALLET_STATUS.UNLOCKED)
            return this._storage.decrypted.accounts;

        return {};
    }

    async updateAccount(address){
        logger.info(`Account update requested for ${address}`);

        const account = await rpc.getAccount(address);
        const transactions = await rpc.getTransactions(address);
        logger.info('Account updated', { account });

        this._accounts[address] = Utils.convertAccountObject(address, account, transactions);
    }

    async updateAccounts(){
        logger.info('Requesting batch account update');

        for(let address in this.getAccounts())
            await this.updateAccount(address);

        logger.info('Batch account update complete');
    }

    addAccount(account) {
        logger.info(`Adding account to wallet ${account.address}`);

        if(!this._storage.decrypted)
            this._storage.decrypted = { accounts: {} };

        this._storage.decrypted.accounts[account.address] = account;
    }

    setupWallet(password = false) {      
        if (this._walletStatus !== WALLET_STATUS.UNINITIALIZED)
            throw 'Wallet cannot be initialized multiple times';

        if (!password)
            throw 'Wallet cannot be initialized without a password';

        logger.info('Initialising wallet for first use');

        this.addAccount(TronUtils.accounts.generateRandomBip39());
        this.saveStorage(password);
        this.unlockWallet(password);
    }

    isSetup() {
        return this._walletStatus !== WALLET_STATUS.UNINITIALIZED;
    }

    unlockWallet(password) {
        logger.info('Requested wallet unlock');

        try {
            this._storage.decrypted = JSON.parse(Utils.decrypt(this._storage.encrypted, password));
            this._currentAccount = Object.keys(this._storage.decrypted.accounts)[0];
            this._walletStatus = WALLET_STATUS.UNLOCKED;

            logger.info('Wallet unlocked successfully');
            return true;
        } catch (e) {
            logger.warn('Error unlocking wallet');
            logger.error(e);

            return false;
        }
    }

    getAccount(address = this._currentAccount) {
        if(this._walletStatus !== WALLET_STATUS.UNLOCKED)
            return false;

        return this._accounts[address];
    }

    get status() {
        return this._walletStatus;
    }
}