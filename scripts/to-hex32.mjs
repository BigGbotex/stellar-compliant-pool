const [, , decimal] = process.argv;
if (!decimal) {
  console.error('Usage: node to-hex32.mjs <decimal>');
  process.exit(1);
}
const hex = BigInt(decimal).toString(16).padStart(64, '0');
console.log(hex);
