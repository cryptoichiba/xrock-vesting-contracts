import { Address, beginCell, toNano, Cell, storeStateInit } from '@ton/core';
import { JettonLockup, VestingData } from '../wrappers/JettonLockup';
import { compile, NetworkProvider } from '@ton/blueprint';
import { randomAddress } from '@ton/test-utils';

import { mnemonicToPrivateKey } from "@ton/crypto";
import { WalletContractV5R1 } from "@ton/ton";
import { JETTON_MASTER_ADDRESS, JETTON_WALLET_CODE } from "../wrappers/Config"

export async function run(provider: NetworkProvider) {
    const userJettonWalletInit = (address: Address): Cell => {
        return beginCell()
          .store(
            storeStateInit({
                code: JETTON_WALLET_CODE,
                data: beginCell()
                  .storeCoins(0)
                  .storeAddress(address)
                  .storeAddress(JETTON_MASTER_ADDRESS)
                  .storeRef(JETTON_WALLET_CODE)
                  .endCell(),
            }),
          )
          .endCell();
    };
    const userJettonWalletAddress = (address: Address): Address => {
        return new Address(0, userJettonWalletInit(address).hash());
    };

    const tokenBalanceConfig = 25000n;
    let claimerAddress = Address.parse("UQBcwZyR_6UZAfRjIqmw-aMPs46FXAHaEEQBojCG_8snMy9D")

    const jettonLockup = provider.open(
        JettonLockup.createFromConfig({
            adminAddress: provider.sender().address!,
            claimerAddress: claimerAddress
        }, await compile('JettonLockup')));

    let vestingDataConfig: VestingData = {
        jettonWalletAddress: userJettonWalletAddress(jettonLockup.address),
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

    console.log("Vesting contract's Jetton wallet: ", vestingDataConfig.jettonWalletAddress);

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
