const fs = require("fs");
const path = require("path");
const os = require("os");
const selfsigned = require("selfsigned");

function isIPv4(value) {
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(value);
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function getAltNames(host) {
  const names = ["localhost", "127.0.0.1"];

  if (host && host !== "0.0.0.0") {
    names.push(host);
  }

  const interfaces = os.networkInterfaces();
  Object.values(interfaces).forEach((entries) => {
    (entries || []).forEach((item) => {
      if (item && item.family === "IPv4" && !item.internal) {
        names.push(item.address);
      }
    });
  });

  return unique(names);
}

function ensureDirForFile(filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

function loadOrCreateCertificate({ host, keyPath, certPath }) {
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return {
      key: fs.readFileSync(keyPath, "utf8"),
      cert: fs.readFileSync(certPath, "utf8"),
      created: false,
    };
  }

  const altNames = getAltNames(host).map((value) =>
    isIPv4(value) ? { type: 7, ip: value } : { type: 2, value }
  );

  const attrs = [{ name: "commonName", value: host && host !== "0.0.0.0" ? host : "localhost" }];

  const pems = selfsigned.generate(attrs, {
    keySize: 2048,
    days: 3650,
    algorithm: "sha256",
    extensions: [
      {
        name: "subjectAltName",
        altNames,
      },
    ],
  });

  ensureDirForFile(keyPath);
  ensureDirForFile(certPath);

  fs.writeFileSync(keyPath, pems.private, "utf8");
  fs.writeFileSync(certPath, pems.cert, "utf8");

  return {
    key: pems.private,
    cert: pems.cert,
    created: true,
  };
}

module.exports = { loadOrCreateCertificate };
