import { Address, beginCell, toNano, Cell, storeStateInit } from '@ton/core';
import { JettonLockup, VestingData } from '../wrappers/JettonLockup';
import { compile, NetworkProvider } from '@ton/blueprint';
import { randomAddress } from '@ton/test-utils';

import { mnemonicToPrivateKey } from "@ton/crypto";
import { WalletContractV5R1, JettonMaster } from "@ton/ton";
import { JETTON_MASTER_ADDRESS, JETTON_WALLET_CODE } from "../wrappers/Config"

export async function run(provider: NetworkProvider) {


    const tokenBalanceConfig = 25000n;
    let claimerAddress = Address.parse("UQBcwZyR_6UZAfRjIqmw-aMPs46FXAHaEEQBojCG_8snMy9D")

    const jettonLockup = provider.open(
        JettonLockup.createFromConfig({
            adminAddress: provider.sender().address!,
            claimerAddress: claimerAddress
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

    const claimableTokens = await jettonLockup.getClaimableTokens();
    console.log('Claimable Tokens: ', claimableTokens);

    const minFee = await jettonLockup.getMinFee();

    // @ts-ignore
    const mnemonic = process.env.WALLET_MNEMONIC.split(" ");

    const keys = await mnemonicToPrivateKey(mnemonic);
    const wallet = provider.open(
      WalletContractV5R1.create({
          workchain: 0,
          publicKey: keys.publicKey,
      }),
    );
    const claimerSender = wallet.sender(keys.secretKey);

    await jettonLockup.sendClaimTokens(claimerSender, minFee, tokenBalanceConfig);
}
