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


let credOfferResolve
let relCreateResolve
let relInvitationResolve
let connectionResolve


async function issuer () {

 // STEP 5 - Relationship creation
  // create relationship key
  const relationshipCreateMessage = {
    label: 'Trinity College',
    logoUrl: 'https://robohash.org/65G.png'
  }
  const relationshipCreate =
    new Promise(function (resolve, reject) {
      relCreateResolve = resolve
      sendVerityRESTMessage('123456789abcdefghi1234', 'relationship', '1.0', 'create', relationshipCreateMessage)
    })
  const [relationshipDid, relThreadId] = await relationshipCreate//how we are gtting the relationshipDid---Hanuman(To Do)
  // create invitation
  const relationshipInvitationMessage = {
    '~for_relationship': relationshipDid
  }
  const relationshipInvitation =
    new Promise(function (resolve, reject) {
      relInvitationResolve = resolve
      sendVerityRESTMessage('123456789abcdefghi1234', 'relationship', '1.0', 'connection-invitation', relationshipInvitationMessage, relThreadId)
    })
  const inviteUrl = await relationshipInvitation
  console.log(`Invite URL is:\n${inviteUrl}`)
  await QR.toFile('qrcode.png', inviteUrl)
  // establish connection
  console.log('Open file qrcode.png and scan it with ConnectMe app')
  const connection =
    new Promise(function (resolve, reject) {
      connectionResolve = resolve
    })
  await connection


  // STEP 6 - Credential issuance
  const credentialData = {
    name: 'Joe Smith',
    degree: 'Bachelors'
  }
  const credentialMessage = {
    '~for_relationship': relationshipDid,
    name: 'Diploma',
    cred_def_id: credDefId,
    credential_values: credentialData,
    price: 0,
    comment: 'Diploma',
    auto_issue: true
  }

  const credentialOffer =
    new Promise(function (resolve, reject) {
      credOfferResolve = resolve
      sendVerityRESTMessage('BzCbsNYhMrjHiqZDTUASHg', 'issue-credential', '1.0', 'offer', credentialMessage)
    })

  await credentialOffer

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
    
    case 'did:sov:123456789abcdefghi1234;spec/write-cred-def/0.6/status-report':
      credDefResolve(message.credDefId)
      break
    case 'did:sov:123456789abcdefghi1234;spec/relationship/1.0/created':
      relCreateResolve([message.did, message['~thread'].thid])
      break
    case 'did:sov:123456789abcdefghi1234;spec/relationship/1.0/invitation':
      relInvitationResolve(message.inviteURL)
      break
    case 'did:sov:BzCbsNYhMrjHiqZDTUASHg;spec/connections/1.0/request-received':
      break
    case 'did:sov:BzCbsNYhMrjHiqZDTUASHg;spec/connections/1.0/response-sent':
      connectionResolve(null)
    case 'did:sov:BzCbsNYhMrjHiqZDTUASHg;spec/issue-credential/1.0/sent':
      console.log(`hanuman message type ${message.msg}`)
      if (message.msg['credentials~attach']) {
        credOfferResolve()
      }
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
