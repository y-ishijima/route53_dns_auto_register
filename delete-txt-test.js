const { Route53Client, ChangeResourceRecordSetsCommand } = require('@aws-sdk/client-route-53');
const { loadEnvFile } = require('./dist/cli.js');
loadEnvFile('.env');
const client = new Route53Client({ region: 'ap-northeast-1' });

(async () => {
  const cmd = new ChangeResourceRecordSetsCommand({
    HostedZoneId: 'ZPS49ZOFSRKVC',
    ChangeBatch: {
      Changes: [{
        Action: 'DELETE',
        ResourceRecordSet: {
          Name: '__dns_auto_test-s9999.yamaokaya.net',
          Type: 'TXT',
          TTL: 300,
          ResourceRecords: [{ Value: '"5bGx5bKh5a6244OG44K544OI5bqX"' }],
        },
      }],
    },
  });
  const res = await client.send(cmd);
  console.log('deleted:', res.ChangeInfo?.Id, res.ChangeInfo?.Status);
})().catch(e => console.error(e.message));
