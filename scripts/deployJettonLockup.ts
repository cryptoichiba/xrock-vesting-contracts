import { OpenedContract, Sender, SendMode, toNano } from '@ton/core';
import { JettonLockup, VestingData } from '../wrappers/JettonLockup';
import { compile, NetworkProvider } from '@ton/blueprint';

import { KeyPair, mnemonicToPrivateKey } from '@ton/crypto';
import { WalletContractV5R1, JettonMaster, internal } from "@ton/ton";
import { JETTON_MASTER_ADDRESS } from "../wrappers/Config"

async function createWallet(provider: NetworkProvider, mnemonic: string) {
    const keys = await mnemonicToPrivateKey(mnemonic.split(" "));
    const wallet = provider.open(
        WalletContractV5R1.create({
            workchain: 0,
            publicKey: keys.publicKey,
        }),
    );
    return [keys, wallet, wallet.sender(keys.secretKey)];
}

export async function run(provider: NetworkProvider) {
    const tokenBalanceConfig = 25000n;

    let deployerKeys: KeyPair;
    let deployerWallet: OpenedContract<WalletContractV5R1>;
    let deployerSender: Sender;
    // @ts-ignore
    [deployerKeys, deployerWallet, deployerSender] = await createWallet(provider, process.env.WALLET_MNEMONIC);

    let claimerKeys: KeyPair;
    let claimerWallet: OpenedContract<WalletContractV5R1>;
    let claimerSender: Sender;
    // @ts-ignore
    [claimerKeys, claimerWallet, claimerSender] = await createWallet(provider, process.env.WALLET_CLAIM_MNEMONIC);

    const jettonLockup = provider.open(
        JettonLockup.createFromConfig({
            adminAddress: deployerSender.address!,
            claimerAddress: claimerSender.address!
        }, await compile('JettonLockup')));

    const jettonMaster = provider.open(JettonMaster.create(JETTON_MASTER_ADDRESS));
    const lockup_contract_jetton_wallet_address = await jettonMaster.getWalletAddress(jettonLockup.address);
    console.log('Jetton address: ', lockup_contract_jetton_wallet_address);

    let vestingDataConfig: VestingData = {
        jettonWalletAddress: lockup_contract_jetton_wallet_address,
        cliffEndDate: 60,
        cliffNumerator: 12,
        cliffDenominator: 100,
        vestingPeriod: 30,
        vestingNumerator: 15,
        vestingDenominator: 100,
        unlocksCount: 0,
    };
    vestingDataConfig.unlocksCount = Math.ceil(
        (1 - vestingDataConfig.cliffNumerator / vestingDataConfig.cliffDenominator) /
        (vestingDataConfig.vestingNumerator / vestingDataConfig.vestingDenominator),
    );

    await jettonLockup.sendDeploy(
        provider.sender(),
        toNano('1'),
        tokenBalanceConfig,
        vestingDataConfig
    );

    await provider.waitForDeploy(jettonLockup.address);

    /** TODO: ここでjettonを送る
    const seqno = await deployerWallet.getSeqno();
    await deployerWallet.sendTransfer({
        seqno,
        secretKey: deployerKeys.secretKey,
        sendMode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
        messages: [
            internal({
                value: '0.001',
                to: lockup_contract_jetton_wallet_address,
                body: 'Hello world'
            })
        ]
    });
    **/

    const claimableTokens = await jettonLockup.getClaimableTokens();
    console.log('Claimable Tokens: ', claimableTokens);

    const minFee = await jettonLockup.getMinFee();

    await jettonLockup.sendClaimTokens(claimerSender, minFee, tokenBalanceConfig);
}
