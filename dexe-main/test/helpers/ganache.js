class Ganache {
  constructor(web3) {
    this.snapshotId = 0;
    this.web3 = web3;
    this.revert = this.revert.bind(this);
    this.snapshot = this.snapshot.bind(this);
    this.setTime = this.setTime.bind(this);
    this.mine = this.mine.bind(this);
  }

  revert() {
    return new Promise((resolve, reject) => {
      this.web3.currentProvider.send(
        {
          jsonrpc: '2.0',
          method: 'evm_revert',
          id: Date.now(),
          params: [this.snapshotId],
        },
        (err, result) => {
          if (err) {
            return reject(err);
          }
          return resolve(this.snapshot());
        },
      );
    });
  }

  snapshot() {
    return new Promise((resolve, reject) => {
      this.web3.currentProvider.send(
        {
          jsonrpc: '2.0',
          method: 'evm_snapshot',
          id: Date.now(),
        },
        (err, result) => {
          if (err) {
            return reject(err);
          }
          this.snapshotId = parseInt(result.result);
          return resolve();
        },
      );
    });
  }

  setTime(timestamp) {
    return new Promise((resolve, reject) => {
      this.web3.currentProvider.send(
        {
          jsonrpc: '2.0',
          method: 'evm_mine',
          params: [timestamp],
          id: Date.now(),
        },
        (err, result) => {
          if (err) {
            return reject(error);
          }
          return resolve(result.result);
        },
      );
    });
  }

  mine() {
    return this.setTime(Math.ceil(Date.now() / 1000));
  }
}

module.exports = Ganache;
