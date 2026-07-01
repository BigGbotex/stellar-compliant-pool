import fs from 'fs';
const note = JSON.parse(fs.readFileSync('note.json', 'utf8'));
const identity = JSON.parse(fs.readFileSync('identity.json', 'utf8'));

const config = {
  poolCommitments: [note.commitment],
  withdrawIndex: 0,
  nullifier: note.nullifier,
  secret: note.secret,
  aspLeaves: [identity.leaf],
  aspIndex: 0,
  identitySecret: identity.identitySecret,
};
fs.writeFileSync('config.json', JSON.stringify(config, null, 2));
console.log('Wrote config.json');
