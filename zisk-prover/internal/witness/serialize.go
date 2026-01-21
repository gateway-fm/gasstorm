package witness

import (
	"bytes"
	"encoding/binary"
	"fmt"
)

// SerializeForZisK serializes a BlockWitness to bincode format for the ZisK guest program.
// This must match the Rust bincode deserialization in guest/src/main.rs
func SerializeForZisK(w *BlockWitness) ([]byte, error) {
	var buf bytes.Buffer

	// block_number: u64
	if err := binary.Write(&buf, binary.LittleEndian, w.BlockNumber); err != nil {
		return nil, fmt.Errorf("failed to write block_number: %w", err)
	}

	// timestamp: u64
	if err := binary.Write(&buf, binary.LittleEndian, w.Timestamp); err != nil {
		return nil, fmt.Errorf("failed to write timestamp: %w", err)
	}

	// gas_limit: u64
	if err := binary.Write(&buf, binary.LittleEndian, w.GasLimit); err != nil {
		return nil, fmt.Errorf("failed to write gas_limit: %w", err)
	}

	// base_fee: u64
	if err := binary.Write(&buf, binary.LittleEndian, w.BaseFee); err != nil {
		return nil, fmt.Errorf("failed to write base_fee: %w", err)
	}

	// coinbase: [u8; 20]
	if _, err := buf.Write(w.Coinbase[:]); err != nil {
		return nil, fmt.Errorf("failed to write coinbase: %w", err)
	}

	// prev_block_hash: [u8; 32]
	if _, err := buf.Write(w.PrevBlockHash[:]); err != nil {
		return nil, fmt.Errorf("failed to write prev_block_hash: %w", err)
	}

	// accounts: Vec<AccountWitness> - write length as u64, then each account
	if err := binary.Write(&buf, binary.LittleEndian, uint64(len(w.Accounts))); err != nil {
		return nil, fmt.Errorf("failed to write accounts length: %w", err)
	}
	for i, acc := range w.Accounts {
		if err := serializeAccount(&buf, &acc); err != nil {
			return nil, fmt.Errorf("failed to write account %d: %w", i, err)
		}
	}

	// transactions: Vec<TxWitness> - write length as u64, then each tx
	if err := binary.Write(&buf, binary.LittleEndian, uint64(len(w.Transactions))); err != nil {
		return nil, fmt.Errorf("failed to write transactions length: %w", err)
	}
	for i, tx := range w.Transactions {
		if err := serializeTx(&buf, &tx); err != nil {
			return nil, fmt.Errorf("failed to write tx %d: %w", i, err)
		}
	}

	return buf.Bytes(), nil
}

func serializeAccount(buf *bytes.Buffer, acc *AccountWitness) error {
	// address: [u8; 20]
	if _, err := buf.Write(acc.Address[:]); err != nil {
		return err
	}

	// nonce: u64
	if err := binary.Write(buf, binary.LittleEndian, acc.Nonce); err != nil {
		return err
	}

	// balance: [u8; 32]
	if _, err := buf.Write(acc.Balance[:]); err != nil {
		return err
	}

	// code: Vec<u8> - write length as u64, then bytes
	if err := binary.Write(buf, binary.LittleEndian, uint64(len(acc.Code))); err != nil {
		return err
	}
	if _, err := buf.Write(acc.Code); err != nil {
		return err
	}

	// storage: Vec<StorageSlot> - write length as u64, then each slot
	if err := binary.Write(buf, binary.LittleEndian, uint64(len(acc.Storage))); err != nil {
		return err
	}
	for _, slot := range acc.Storage {
		if _, err := buf.Write(slot.Key[:]); err != nil {
			return err
		}
		if _, err := buf.Write(slot.Value[:]); err != nil {
			return err
		}
	}

	return nil
}

func serializeTx(buf *bytes.Buffer, tx *TxWitness) error {
	// from: [u8; 20]
	if _, err := buf.Write(tx.From[:]); err != nil {
		return err
	}

	// to: Option<[u8; 20]> - write 0/1 discriminant, then data if Some
	if tx.To != nil {
		if err := buf.WriteByte(1); err != nil {
			return err
		}
		if _, err := buf.Write(tx.To[:]); err != nil {
			return err
		}
	} else {
		if err := buf.WriteByte(0); err != nil {
			return err
		}
	}

	// value: [u8; 32]
	if _, err := buf.Write(tx.Value[:]); err != nil {
		return err
	}

	// input: Vec<u8>
	if err := binary.Write(buf, binary.LittleEndian, uint64(len(tx.Input))); err != nil {
		return err
	}
	if _, err := buf.Write(tx.Input); err != nil {
		return err
	}

	// gas_limit: u64
	if err := binary.Write(buf, binary.LittleEndian, tx.GasLimit); err != nil {
		return err
	}

	// gas_price: u64
	if err := binary.Write(buf, binary.LittleEndian, tx.GasPrice); err != nil {
		return err
	}

	// nonce: u64
	if err := binary.Write(buf, binary.LittleEndian, tx.Nonce); err != nil {
		return err
	}

	return nil
}
