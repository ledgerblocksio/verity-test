'use strict'

const axios = require('axios')
const bodyParser = require('body-parser')
const express = require('express')
const QR = require('qrcode')
const uuid4 = require('uuid4')

const PORT = 4000
const verityUrl = 'https://vas.pps.evernym.com' // address of Verity Application Server
const domainDid = 'UqZSfRi8fZzorGNwZVgVpT' // your Domain DID on the multi-tenant Verity Application Server
const xApiKey = '3JbfUmhTyk2aKDZxzmQcN4UEGUTkjc77vTBUnqj9w9LW:67Ae5GteDkNsL9xJVLgzzEnLo6Tddxsogh7wknnVb1azDjhKD4Ktt73uPN9qtMHwdgLvQqhG23c2rnW8aUS5xXqu' // REST API key associated with your Domain DID
const webhookUrl = 'https://3f8220e387d0.ngrok.io/webhook' // public URL for the webhook endpoint

// Sends Verity REST API call to Verity Application server
async function sendVerityRESTMessage (qualifier, msgFamily, msgFamilyVersion, msgName, message, threadId) {
  // Add @type and @id fields to the message
  // Field @type is dinamycially constructed based on the function arguments and added into the message payload
  message['@type'] = `did:sov:${qualifier};spec/${msgFamily}/${msgFamilyVersion}/${msgName}`
  message['@id'] = uuid4()
  if (!threadId) {
    threadId = uuid4()
  }
  const url = `${verityUrl}/api/${domainDid}/${msgFamily}/${msgFamilyVersion}/${threadId}`
  console.log(`Posting message to ${url}`)
  console.log(message)
  return axios({
    method: 'POST',
    url: url,
    data: message,
    headers: {
      'X-API-key': xApiKey // <-- REST API Key is added in the header
    }
  })
}

// Registers issuer DID/Verkey as Endorser on Sovrin Staging Net
async function registerDid (issuerDid, issuerVerkey) {
  return axios.post('https://selfserve.sovrin.org/nym',
    {
      network: 'stagingnet',
      did: issuerDid,
      verkey: issuerVerkey,
      paymentaddr: ''
    })
}

let setupResolve


async function issuer () {

  // STEP 2 - Setup Issuer
  const setupIssuer =
    new Promise(function (resolve, reject) {
      setupResolve = resolve
      sendVerityRESTMessage('123456789abcdefghi1234', 'issuer-setup', '0.6', 'create', {})
    })
  const [issuerDid, issuerVerkey] = await setupIssuer
  // Automatic registration of DID/Verkey as Endorser using Sovrin SelfServe portal
  const sovrinResponse = await registerDid(issuerDid, issuerVerkey)
  console.log(`DID registration response from Sovrin SelfServe portal:\n${sovrinResponse.data.body}`)

  console.log('Demo completed!')
  process.exit(0)
}

const app = express()

app.use(bodyParser.json())

// Verity Application Server will send REST API callbacks to this endpoint
app.post('/webhook', async (req, res) => {
  const message = req.body
  console.log('Got message on the webhook')
  console.log(message)
  res.status(202).send('Accepted')
  // Handle received message differently based on the message type
  switch (message['@type']) {
    case 'did:sov:123456789abcdefghi1234;spec/issuer-setup/0.6/public-identifier-created':
      setupResolve([message.identifier.did, message.identifier.verKey])
      break
    case 'did:sov:123456789abcdefghi1234;spec/issuer-setup/0.6/problem-report':
      if (
        message.message === 'Issuer Identifier is already created or in the process of creation'
      ) {
        await sendVerityRESTMessage('123456789abcdefghi1234', 'issuer-setup', '0.6', 'current-public-identifier', {})
      }
      break
    case 'did:sov:123456789abcdefghi1234;spec/issuer-setup/0.6/public-identifier':
      setupResolve([message.did, message.verKey])
      break
    default:
      console.log(`Unexpected message type ${message['@type']}`)
      process.exit(1)
  }
})

app.listen(PORT, () => {
  console.log(`Webhook listening on port ${PORT}`)
  issuer()
})
