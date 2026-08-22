# Vendored dependencies

## qrcode.js

`qrcode-generator` v1.4.4 by Kazuhiko Arase — MIT license.
Source: https://www.npmjs.com/package/qrcode-generator

Copied verbatim from the npm package, with one addition: an
`export default qrcode;` shim appended at the end of the file so it can be
imported as an ES module without a build step.

## js/wordlist.js (one directory up)

The EFF large wordlist (7776 words) for diceware-style passphrases,
published by the Electronic Frontier Foundation (CC-BY 3.0):
https://www.eff.org/dice — converted to a JS array module.
