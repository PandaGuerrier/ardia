import assert from "node:assert/strict";
import { test } from "node:test";
import { isLocalAddress } from "./localAddress.ts";

test("loopback, private ranges and local names are local addresses", () => {
  for (const url of [
    "http://localhost:3000/",
    "http://app.localhost:5173/",
    "http://127.0.0.1:8080/api",
    "http://10.0.0.12/",
    "http://192.168.1.1/admin",
    "http://172.16.0.4/",
    "http://172.31.255.1/",
    "http://169.254.10.1/",
    "http://100.64.0.1/",
    "http://0.0.0.0:8000/",
    "http://[::1]:3000/",
    "http://[fd12:3456::1]/",
    "http://[fe80::1]/",
    "http://[::ffff:192.168.0.2]/",
    "https://printer.local/",
    "http://router.lan/",
    "http://nas.home.arpa/",
    "https://myapp.test/",
  ])
    assert.equal(isLocalAddress(url), true, url);
});

test("public sites, public IPs and non-web URLs are not", () => {
  for (const url of [
    "https://youtube.com/",
    "https://localhost.example.com/",
    "http://8.8.8.8/",
    "http://172.32.0.1/",
    "http://192.169.0.1/",
    "http://999.168.1.1/",
    "http://[2001:4860::8888]/",
    "file:///Users/me/index.html",
    "ardia://history",
    "chrome://settings",
    "",
    null,
    "not a url",
  ])
    assert.equal(isLocalAddress(url), false, String(url));
});
