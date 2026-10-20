// Calls an https://github.com/FindyFi/oid4vci-issuer instance to turn an
// already-built, unsigned Verifiable Credential into a wallet-scannable
// OID4VCI credential offer. Actual signing happens inside that service once a
// wallet completes the flow - this only creates the offer. `disclosable`
// (dc+sd-jwt only) names the top-level claims to make selectively disclosable.
// No transaction code by default: it would be shown next to the QR code, so
// it adds friction without protecting the offer (W4, threat analysis T11).
export async function createOffer(unsignedCredential, { baseUrl, tenant, token, txCode = false, credentialConfigurationId = 'OpenBadgeCredentialSdJwt', disclosable }) {
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
      ...(disclosable ? { disclosable } : {}),
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

// Whether each offer (by its pre-authorized code) is still waiting for a
// wallet, was picked up, or is gone: 'waiting' | 'picked-up' | 'expired'. The
// issuer forgets an offer when it expires, and a used one a minute after use,
// so 'expired' can also mean picked up a while ago; the dialog remembers what
// it saw. Throws if the issuer can't answer.
export async function offerStatuses(codes, { baseUrl, tenant }) {
  const statuses = await Promise.all(
    codes.map(async (code) => {
      const res = await fetch(new URL(`/instance/${tenant}/offers/${code}/status`, baseUrl))
      if (res.status === 404) {
        await res.body?.cancel()
        return 'expired'
      }
      if (!res.ok) {
        await res.body?.cancel()
        throw new Error(`OID4VCI issuer responded with ${res.status} ${res.statusText}`)
      }
      const { used } = await res.json()
      return used ? 'picked-up' : 'waiting'
    })
  )
  return Object.fromEntries(codes.map((code, i) => [code, statuses[i]]))
}
