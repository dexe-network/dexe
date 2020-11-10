module.exports = {
  plugins: ["solidity-coverage"],
  networks: {
    development: {
      host: "localhost",
      port: 8545,
      network_id: "*",
      gas: 12000000,
    },
  },
  compilers: {
    solc: {
      version: "0.7.4",
      settings: {
        optimizer: {
          enabled: true,
          runs: 1,
        },
      },
    },
  },
};
