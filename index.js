const Promise = require('bluebird')
const fetch = require('node-fetch')
const _ = require('lodash')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const tokenFile = path.join(__dirname, 'token')

function getToken (token) {
  if (_.isNil(token)) {
    throw new Error()
  }
  return fetch(`https://login.questrade.com/oauth2/token?grant_type=refresh_token&refresh_token=${token}`, {
    method: 'POST',
    body: `grant_type=refresh_token&refresh_token=${token}`
  })
    .then(res => res.json())
}

function readToken () {
  let token = process.argv[2]
  if (_.isNil(token)) {
    let tokenFileStructure
    try {
      const tokenFileContent = fs.readFileSync(tokenFile).toString()
      tokenFileStructure = JSON.parse(tokenFileContent)
      token = tokenFileStructure.refresh_token
    } catch (e) {
      return Promise.reject(new Error())
    }
  }
  return Promise.resolve(token)
}

function getAccounts (questradeHost, accessToken) {
  return fetch(`${questradeHost}v1/accounts`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })
    .then(res => res.json())
}

function getPositions (questradeHost, accessToken, accountId) {
  return fetch(`${questradeHost}v1/accounts/${accountId}/positions`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })
    .then(res => res.json())
}

function getBalances (questradeHost, accessToken, accountId) {
  return fetch(`${questradeHost}v1/accounts/${accountId}/balances`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })
    .then(res => res.json())
}

readToken()
  .then((token) => getToken(token))
  .tap((data) => {
    data.written = Date.now()
    fs.writeFileSync(tokenFile, JSON.stringify(data), 'ascii')
  })
  .then((data) => {
    const questradeHost = data.api_server
    const accessToken = data.access_token
    return getAccounts(questradeHost, accessToken)
      .then((rawAccounts) => {
        const {accounts, userId} = rawAccounts
        return Promise.map(accounts, (account) => {
          const number = account.number
          account.number = crypto.createHash('sha1').update(account.number).digest('hex')
          return Promise
            .all([
              getPositions(questradeHost, accessToken, number),
              getBalances(questradeHost, accessToken, number)
            ])
            .spread((positions, balances) => Promise
              .resolve({
                account,
                positions,
                balances
              })
            )
        })
      })
  })
  .then((positions) => {
    console.log(JSON.stringify(positions, undefined, 2))
  })
  .catch((err) => {
    console.warn('Error happened:')
    console.warn('Maybe try with a new token from the API dashboard?')
  })
