#!/bin/sh
# EDC1 spike: seal an unsigned ELM credential at JAdES LT (or LTA) with the test PKI.
# Needs the test PKI from test-pki.sh and its CRL served at the URL given there.
# Usage: sh seal.sh <unsigned.jsonld> <pki-dir> <out.jsonld> [LT|LTA]
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
OPENSSL=${OPENSSL:-/opt/homebrew/bin/openssl}
TSA=${TSA:-http://timestamp.digicert.com}
LEVEL=${4:-LT}
CP="$HERE/sealer/lib/*:$HERE/sealer/classes"
T_LEVEL=$(mktemp -t edc1-T)
java -cp "$CP" Seal sign "$1" "$2/seal.p12" spike "$T_LEVEL" T "$TSA" 2>&1 | grep -v -E '^\[main\] (INFO|WARN)'
test -s "$T_LEVEL"
sleep 2
# Fresh CRL, issued after the signature time
(cd "$2" && $OPENSSL ca -batch -config ca.cnf -cert root.pem -keyfile root.key -gencrl -out root.crl.pem 2>/dev/null && $OPENSSL crl -in root.crl.pem -outform DER -out root.crl)
java -cp "$CP" Seal extend "$T_LEVEL" "$2/root.pem" "$3" "$LEVEL" "$TSA" 2>&1 | grep -v '^\[main\] INFO'
rm -f "$T_LEVEL"
test -s "$3"
