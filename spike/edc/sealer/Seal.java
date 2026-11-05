// EDC1 spike: seal an ELM credential as JAdES (the EDC format) with EU DSS, and
// validate a sealed file the way a DSS-based verifier would.
//
//   java -cp 'lib/*:.' Seal sign <credential.jsonld> <seal.p12> <password> <out.jsonld> <B|T|LT|LTA> <tsa-url>
//   java -cp 'lib/*:.' Seal validate <sealed.jsonld> [trusted-root.pem ...]
//
// Shape follows the EU samples (Sample-*-signed.jsonld): JWS JSON serialisation,
// enveloping, unencoded payload (b64:false), RS256, x5c + x5t#S256 + sigT.

import eu.europa.esig.dss.enumerations.*;
import eu.europa.esig.dss.jades.JAdESSignatureParameters;
import eu.europa.esig.dss.jades.signature.JAdESService;
import eu.europa.esig.dss.model.*;
import eu.europa.esig.dss.model.x509.CertificateToken;
import eu.europa.esig.dss.service.crl.OnlineCRLSource;
import eu.europa.esig.dss.service.http.commons.CommonsDataLoader;
import eu.europa.esig.dss.service.http.commons.OCSPDataLoader;
import eu.europa.esig.dss.service.ocsp.OnlineOCSPSource;
import eu.europa.esig.dss.service.tsp.OnlineTSPSource;
import eu.europa.esig.dss.simplereport.SimpleReport;
import eu.europa.esig.dss.spi.DSSUtils;
import eu.europa.esig.dss.spi.validation.CommonCertificateVerifier;
import eu.europa.esig.dss.spi.x509.CommonTrustedCertificateSource;
import eu.europa.esig.dss.spi.x509.aia.DefaultAIASource;
import eu.europa.esig.dss.alert.LogOnStatusAlert;
import eu.europa.esig.dss.token.KSPrivateKeyEntry;
import eu.europa.esig.dss.token.Pkcs12SignatureToken;
import eu.europa.esig.dss.validation.SignedDocumentValidator;
import eu.europa.esig.dss.validation.reports.Reports;

import java.io.File;
import java.security.KeyStore;
import java.util.List;

public class Seal {
  static CommonCertificateVerifier verifier(String[] trustedRoots) {
    CommonCertificateVerifier v = new CommonCertificateVerifier();
    v.setCrlSource(new OnlineCRLSource(new CommonsDataLoader()));
    v.setOcspSource(new OnlineOCSPSource(new OCSPDataLoader()));
    v.setAIASource(new DefaultAIASource(new CommonsDataLoader()));
    CommonTrustedCertificateSource trusted = new CommonTrustedCertificateSource();
    for (String pem : trustedRoots) trusted.addCertificate(DSSUtils.loadCertificate(new File(pem)));
    v.setTrustedCertSources(trusted);
    // Spike: report problems, don't abort on them
    v.setAlertOnMissingRevocationData(new LogOnStatusAlert());
    v.setAlertOnUncoveredPOE(new LogOnStatusAlert());
    v.setAlertOnRevokedCertificate(new LogOnStatusAlert());
    v.setAlertOnInvalidTimestamp(new LogOnStatusAlert());
    v.setAlertOnNoRevocationAfterBestSignatureTime(new LogOnStatusAlert());
    v.setAlertOnExpiredCertificate(new LogOnStatusAlert());
    return v;
  }

  public static void main(String[] a) throws Exception {
    switch (a[0]) {
      case "sign" -> sign(a);
      case "extend" -> extend(a);
      default -> validate(a);
    }
  }

  static void sign(String[] a) throws Exception {
    DSSDocument doc = new FileDocument(a[1]);
    try (Pkcs12SignatureToken token = new Pkcs12SignatureToken(a[2], new KeyStore.PasswordProtection(a[3].toCharArray()))) {
      KSPrivateKeyEntry key = (KSPrivateKeyEntry) token.getKeys().get(0);
      JAdESSignatureParameters p = new JAdESSignatureParameters();
      p.setSignatureLevel(SignatureLevel.valueOf("JAdES_BASELINE_" + a[5]));
      p.setSignaturePackaging(SignaturePackaging.ENVELOPING);
      p.setJwsSerializationType(JWSSerializationType.JSON_SERIALIZATION);
      p.setBase64UrlEncodedPayload(false);
      p.setDigestAlgorithm(DigestAlgorithm.SHA256);
      p.setSigningCertificate(key.getCertificate());
      p.setCertificateChain(key.getCertificateChain());
      // Match the EU samples (older DSS): sigT and x5t#S256 instead of DSS 6's
      // defaults iat and x5t#o (ETSI TS 119 182-1 v1.2.1), in case Europass's
      // verifier predates them.
      // EDC1_SIGNING_TIME=IAT keeps DSS 6's default. Note: with SIG_T, DSS 6.5 leaves
      // sigT out of `crit`, and its own validator then calls the result JSON-NOT-ETSI.
      p.setJadesSigningTimeType(eu.europa.esig.dss.jades.JAdESSigningTimeType.valueOf(System.getenv().getOrDefault("EDC1_SIGNING_TIME", "SIG_T")));
      p.setSigningCertificateDigestMethod(DigestAlgorithm.SHA256);

      JAdESService service = service(key.getCertificateChain(), a[6]);
      ToBeSigned tbs = service.getDataToSign(doc, p);
      SignatureValue sig = token.sign(tbs, p.getDigestAlgorithm(), key);
      DSSDocument signed = service.signDocument(doc, p, sig);
      signed.save(a[4]);
      System.out.println("sealed " + a[4] + " at " + p.getSignatureLevel());
    }
  }

  // Trusts our test root (so DSS builds the seal chain) and the JDK's CA list (so it
  // fetches revocation data for the TSA's chain). The real trust check is `validate`.
  static JAdESService service(CertificateToken[] chain, String tsaUrl) throws Exception {
    CommonCertificateVerifier v = verifier(new String[0]);
    CommonTrustedCertificateSource t = new CommonTrustedCertificateSource();
    t.addCertificate(chain[chain.length - 1]);
    v.addTrustedCertSources(t);
    String cacerts = System.getProperty("java.home") + "/lib/security/cacerts";
    CommonTrustedCertificateSource jdk = new CommonTrustedCertificateSource();
    jdk.importAsTrusted(new eu.europa.esig.dss.spi.x509.KeyStoreCertificateSource(new File(cacerts), "PKCS12", "changeit".toCharArray()));
    v.addTrustedCertSources(jdk);
    JAdESService service = new JAdESService(v);
    service.setTspSource(new OnlineTSPSource(tsaUrl));
    return service;
  }

  //   java ... Seal extend <sealed.jsonld> <root.pem> <out.jsonld> <LT|LTA> <tsa-url>
  // Sign at T, refresh the CRL, then extend: LT wants revocation data issued after
  // the signature time, which a CRL made before signing can't be.
  static void extend(String[] a) throws Exception {
    JAdESService service = service(new CertificateToken[] { DSSUtils.loadCertificate(new File(a[2])) }, a[5]);
    JAdESSignatureParameters p = new JAdESSignatureParameters();
    p.setSignatureLevel(SignatureLevel.valueOf("JAdES_BASELINE_" + a[4]));
    p.setJwsSerializationType(JWSSerializationType.JSON_SERIALIZATION);
    service.extendDocument(new FileDocument(a[1]), p).save(a[3]);
    System.out.println("extended to " + a[3] + " at " + p.getSignatureLevel());
  }

  static void validate(String[] a) throws Exception {
    SignedDocumentValidator val = SignedDocumentValidator.fromDocument(new FileDocument(a[1]));
    String[] roots = java.util.Arrays.copyOfRange(a, 2, a.length);
    val.setCertificateVerifier(verifier(roots));
    Reports reports = val.validateDocument();
    SimpleReport r = reports.getSimpleReport();
    if (System.getenv("EDC1_REPORTS") != null) {
      java.nio.file.Files.writeString(java.nio.file.Path.of(System.getenv("EDC1_REPORTS"), "detailed.xml"), reports.getXmlDetailedReport());
      java.nio.file.Files.writeString(java.nio.file.Path.of(System.getenv("EDC1_REPORTS"), "diagnostic.xml"), reports.getXmlDiagnosticData());
    }
    for (String id : r.getSignatureIdList()) {
      System.out.println("signature " + id);
      System.out.println("  format:      " + r.getSignatureFormat(id));
      System.out.println("  indication:  " + r.getIndication(id) + (r.getSubIndication(id) != null ? " / " + r.getSubIndication(id) : ""));
      System.out.println("  signed by:   " + r.getSignedBy(id));
      System.out.println("  qualification: " + r.getSignatureQualification(id));
      for (var m : r.getAdESValidationErrors(id)) System.out.println("  error:   " + m.getValue());
      for (var m : r.getAdESValidationWarnings(id)) System.out.println("  warning: " + m.getValue());
      for (var m : r.getQualificationErrors(id)) System.out.println("  qual error:   " + m.getValue());
    }
  }
}
