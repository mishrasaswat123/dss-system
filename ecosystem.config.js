module.exports = {
  apps: [{
    name: "dss",
    script: "server.js",
    instances: 1,
    exec_mode: "fork",
    env: {
      NODE_ENV: "production",
      AO_API_KEY: "f70c433c-9d61-43d4-bfbd-7bad21d76526",
      AO_CLIENT_ID: "AACH950153",
      AO_MPIN: "1979",
      AO_TOTP_SECRET: "ARANQTCYUC46R4EBCFGSB3HV4I",
      SERVER_PUBLIC_IP: "51.21.94.67"
    }
  }]
};
