// Calls an https://github.com/FindyFi/oid4vci-issuer instance to turn an
// already-built, unsigned Verifiable Credential into a wallet-scannable
// OID4VCI credential offer. Actual signing happens inside that service once a
// wallet completes the flow - this only creates the offer.
export async function createOffer(unsignedCredential, { baseUrl, tenant, token, txCode = true, credentialConfigurationId = 'OpenBadgeCredentialSdJwt' }) {
  if (!baseUrl || !tenant) {
    throw new Error('The OID4VCI issuer is not configured (set OID4VCI_ISSUER_URL and OID4VCI_ISSUER_INSTANCE).')
  }
  const url = new URL(`/instance/${tenant}/offers`, baseUrl)

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      credentialConfigurationId,
      unsignedCredential,
      txCode,
    }),
  })
  if (!res.ok) {
    // Status only: the body may echo the credential we sent, and this message
    // is logged and shown to the user. The service logs the details itself.
    await res.body?.cancel()
    throw new Error(`OID4VCI issuer responded with ${res.status} ${res.statusText}`)
  }
  return res.json()
}
