// Calls an https://github.com/FindyFi/oid4vci-issuer instance to turn an
// already-built, unsigned Verifiable Credential into a wallet-scannable
// OID4VCI credential offer. Actual signing happens inside that service (via
// its own signing-service call) once a wallet completes the flow - this
// only creates the offer.
export async function createOffer(unsignedCredential, { baseUrl, tenant, token, txCode = true }) {
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
      credentialConfigurationId: 'OpenBadgeCredential',
      unsignedCredential,
      txCode,
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`OID4VCI issuer responded with ${res.status} ${res.statusText}${text ? `: ${text}` : ''}`)
  }
  return res.json()
}
