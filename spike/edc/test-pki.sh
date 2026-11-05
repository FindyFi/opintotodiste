#!/bin/sh
# EDC1 spike: a throwaway test PKI. A root CA and an electronic seal certificate
# for "Findynet Osuuskunta" with the ETSI organizationIdentifier NTRFI-3213523-3.
# The root is NOT on any EU trusted list, so a real verifier must reject the seal;
# that is the point of comparing it with what a TSP certificate would give.
#
# Usage: sh test-pki.sh <out-dir> <crl-base-url>   (e.g. http://localhost:8765)
set -eu
OPENSSL=${OPENSSL:-/opt/homebrew/bin/openssl}
OUT=$1
CRL_URL=$2/root.crl
mkdir -p "$OUT" && cd "$OUT"
rm -rf ca && mkdir -p ca/newcerts && : > ca/index.txt && echo 1000 > ca/serial && echo 1000 > ca/crlnumber

cat > ca.cnf <<EOF
[ ca ]
default_ca = test_ca
[ test_ca ]
dir = ./ca
database = \$dir/index.txt
new_certs_dir = \$dir/newcerts
serial = \$dir/serial
crlnumber = \$dir/crlnumber
default_md = sha256
default_crl_days = 30
policy = any
[ any ]
countryName = optional
organizationName = optional
organizationIdentifier = optional
commonName = supplied
[ root_ext ]
basicConstraints = critical, CA:true
keyUsage = critical, keyCertSign, cRLSign
subjectKeyIdentifier = hash
[ seal_ext ]
basicConstraints = critical, CA:false
keyUsage = critical, digitalSignature, nonRepudiation
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid
crlDistributionPoints = URI:$CRL_URL
certificatePolicies = 0.4.0.194112.1.1
EOF
# 0.4.0.194112.1.1 = ETSI EN 319 411-2 QCP-l (policy for EU qualified certificates
# issued to legal persons); claimed here only to see if a verifier looks at it.

$OPENSSL req -x509 -newkey rsa:3072 -nodes -keyout root.key -out root.pem -days 365 \
  -subj "/C=FI/O=EDC1 spike TEST CA/CN=EDC1 spike TEST root" -config ca.cnf -extensions root_ext 2>/dev/null
$OPENSSL req -newkey rsa:3072 -nodes -keyout seal.key -out seal.csr \
  -subj "/C=FI/O=Findynet Osuuskunta/organizationIdentifier=NTRFI-3213523-3/CN=Findynet Osuuskunta TEST seal" 2>/dev/null
$OPENSSL ca -batch -config ca.cnf -cert root.pem -keyfile root.key -in seal.csr -out seal.pem \
  -days 180 -extensions seal_ext -notext 2>/dev/null
$OPENSSL ca -batch -config ca.cnf -cert root.pem -keyfile root.key -gencrl -out root.crl.pem 2>/dev/null
$OPENSSL crl -in root.crl.pem -outform DER -out root.crl
$OPENSSL pkcs12 -export -inkey seal.key -in seal.pem -certfile root.pem -name seal -passout pass:spike -out seal.p12
$OPENSSL x509 -in seal.pem -noout -subject -issuer -ext crlDistributionPoints
