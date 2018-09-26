// Copyright (c) 2018-present, salesforce.com, inc. All rights reserved
// Licensed under BSD 3-Clause - see LICENSE.txt or git.io/sfdc-license

module.exports = (modules) => {
  const my = {}
  const request = modules.request
  const crypto = modules.crypto
  const ENCODED_KEY = modules.constants.ENCODED_KEY

  my.connect = (fields) => {
    return new Promise( (resolve, reject) => {
      const assertion = my.get_assertion(fields)
      const options = {
        url: fields.action,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        form: {
          grant_type: 'urn:ietf:params:oauth:grant-type:saml2-bearer',
          assertion: assertion
        }
      }
      request.post(options, (error, response, body) => {
        if (error) {
          reject(error)
        }
        console.log("Saml connection post response: " + JSON.stringify(response))
        if (body) {
          console.log("Saml connection post body: " + body)
          resolve(body)
        } else (
          reject('No Saml connection response body.')
        )
      })
    })
  }

  my.get_assertion = (fields) => {
    // Prepare the response parameters
    const subject = fields.subject
    const audience = fields.audience
    const issuer = fields.issuer
    const action = fields.action
    const not_before_time = fields.timestamp - 120000
    const not_before = new Date(not_before_time).toISOString().split('.')[0]+"Z"
    const not_on_or_after_time = fields.timestamp + 5*60*1000
    const not_on_or_after = new Date(not_on_or_after_time).toISOString().split('.')[0]+"Z"
    const hash = crypto.createHash('sha256')
    hash.update('assertion' + fields.random.toPrecision())
    //hash.update(new Buffer('assertion0.0'))
    const assertion_id = hash.digest('hex')
    //console.log('assertion_id ' + assertion_id)

    // Prepare the response
    const data = {
      assertion_id, 
      issuer: issuer, 
      recipient: action, 
      audience: audience, 
      subject,
      not_before, 
      not_on_or_after
    }
    const response = get_response(data)

    // Prepare the Digest
    const sha1_sum = crypto.createHash('sha1')
    sha1_sum.update(response)
    const digest = sha1_sum.digest('base64')

    // Prepare the SignedInfo
    const signed_info = get_signed_info({assertion_id, digest})

    // Prepare the signature block
    const sign = crypto.createSign('SHA1')
    sign.write(signed_info)
    sign.end()
    const signature_value = sign.sign(ENCODED_KEY, 'base64')
    const signature_block = get_signature_block({signed_info, signature_value})

    // envelope the signature by swapping out last element with sig + last elements of whole message
    const signed_response = response.replace(/<saml\:Subject>/g, signature_block)

    return base64_url_encode(signed_response)
  }

  const base64_url_encode = (input) => { 
    let output = Buffer.from(input).toString('base64')
    output = output.replace(/\+/g, '-')
    output = output.replace(/\//g, '_')
    while (output.endsWith('=')) {
      output = output.substring(0,output.length-1)
    }
    return output
  }

  const get_response = (fields) => {
    const ASSERTION_ID = fields.assertion_id
    const ISSUER = fields.issuer
    const AUDIENCE = fields.audience
    const RECIPIENT = fields.recipient
    const SUBJECT = fields.subject
    const NOT_BEFORE = fields.not_before
    const NOT_ON_OR_AFTER = fields.not_on_or_after
    //let result = `<saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="${ASSERTION_ID}" IssueInstant="${NOT_BEFORE}" Version="2.0"><saml:Issuer Format="urn:oasis:names:tc:SAML:2.0:nameid-format:entity">${ISSUER}</saml:Issuer><saml:Subject><saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified">${SUBJECT}</saml:NameID><saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer"><saml:SubjectConfirmationData NotOnOrAfter="${NOT_ON_OR_AFTER}" Recipient="${RECIPIENT}"/></saml:SubjectConfirmation></saml:Subject><saml:Conditions NotBefore="${NOT_BEFORE}" NotOnOrAfter="${NOT_ON_OR_AFTER}"><saml:AudienceRestriction><saml:Audience>${AUDIENCE}</saml:Audience></saml:AudienceRestriction></saml:Conditions><saml:AuthnStatement AuthnInstant="${NOT_BEFORE}"><saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:unspecified</saml:AuthnContextClassRef></saml:AuthnContext></saml:AuthnStatement></saml:Assertion>`
    let result = `<saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="${ASSERTION_ID}" IssueInstant="${NOT_BEFORE}" Version="2.0"><saml:Issuer Format="urn:oasis:names:tc:SAML:2.0:nameid-format:entity">${ISSUER}</saml:Issuer><saml:Subject><saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified">${SUBJECT}</saml:NameID><saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer"><saml:SubjectConfirmationData NotOnOrAfter="${NOT_ON_OR_AFTER}" Recipient="${RECIPIENT}"></saml:SubjectConfirmationData></saml:SubjectConfirmation></saml:Subject><saml:Conditions NotBefore="${NOT_BEFORE}" NotOnOrAfter="${NOT_ON_OR_AFTER}"><saml:AudienceRestriction><saml:Audience>${AUDIENCE}</saml:Audience></saml:AudienceRestriction></saml:Conditions><saml:AuthnStatement AuthnInstant="${NOT_BEFORE}"><saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:unspecified</saml:AuthnContextClassRef></saml:AuthnContext></saml:AuthnStatement></saml:Assertion>`
    return result
  }

  const get_signed_info = (fields) => {
    const ASSERTION_ID = fields.assertion_id
    const DIGEST = fields.digest
    //let result = `<ds:SignedInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/><ds:SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/><ds:Reference URI="#${ASSERTION_ID}"><ds:Transforms><ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/><ds:Transform Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/></ds:Transforms><ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/><ds:DigestValue>${DIGEST}</ds:DigestValue></ds:Reference></ds:SignedInfo>`
    let result = `<ds:SignedInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"></ds:CanonicalizationMethod><ds:SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"></ds:SignatureMethod><ds:Reference URI="#${ASSERTION_ID}"><ds:Transforms><ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"></ds:Transform><ds:Transform Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"></ds:Transform></ds:Transforms><ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></ds:DigestMethod><ds:DigestValue>${DIGEST}</ds:DigestValue></ds:Reference></ds:SignedInfo>`
    return result
  }

  const get_signature_block = (fields) => {
    const SIGNED_INFO = fields.signed_info
    const SIGNATURE_VALUE = fields.signature_value
    //let result = `<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${SIGNED_INFO}<ds:SignatureValue>${SIGNATURE_VALUE}</ds:SignatureValue></ds:Signature><saml:Subject>`
    let result = `<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${SIGNED_INFO}<ds:SignatureValue>${SIGNATURE_VALUE}</ds:SignatureValue></ds:Signature><saml:Subject>`
    return result
  }

  return my
}
