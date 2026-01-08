import { Wallet, Transaction, parseEther, keccak256 } from 'ethers';

const wallet = new Wallet('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');

// Get current nonce
const nonceResp = await fetch('http://localhost:18000/rpc/l2', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_getTransactionCount', params: ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', 'latest'], id: 1 })
});
const nonceData = await nonceResp.json();
const nonce = parseInt(nonceData.result, 16);
console.log('Current nonce:', nonce);

const tx = Transaction.from({
  to: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  value: parseEther('0.001'),
  gasLimit: 21000,
  gasPrice: 1000000000n,
  nonce,
  chainId: 42069n,
  type: 0
});

const signedTx = await wallet.signTransaction(tx);
const localHash = keccak256(signedTx);
console.log('Local hash:', localHash);

// Send to builder
const resp = await fetch('http://localhost:18000/rpc/builder', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_sendRawTransaction', params: [signedTx], id: 1 })
});
const data = await resp.json();
console.log('Builder hash:', data.result);
console.log('Hashes match:', localHash === data.result);

// Wait and verify
await new Promise(r => setTimeout(r, 1000));

// Check on L2
const checkResp = await fetch('http://localhost:18000/rpc/l2', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_getTransactionByHash', params: [data.result], id: 2 })
});
const checkData = await checkResp.json();
console.log('On-chain lookup:', checkData.result ? 'FOUND in block ' + parseInt(checkData.result.blockNumber, 16) : 'NOT FOUND');
