"""Validate an ELM 3 credential (unsigned JSON-LD, or a JAdES-sealed file) against
the published EDC generic SHACL shapes (EDC-generic-full, which imports
EDC-generic-no-cv and adds the controlled-vocabulary checks; 2023-09-28).

Usage: python validate.py <credential.json[ld]> [more files...]

Contexts are resolved from ./contexts so validation works offline and against the
exact versions the shapes were published with.
"""
import json
import sys
from pathlib import Path

import pyshacl
import rdflib

HERE = Path(__file__).parent
CONTEXTS = {
    'https://www.w3.org/2018/credentials/v1': HERE / 'contexts/credentials-v1.jsonld',
    'http://data.europa.eu/snb/model/context/edc-ap': HERE / 'contexts/edc-ap.jsonld',
}
SHAPES = [HERE / 'shapes/EDC-generic-no-cv.rdf', HERE / 'shapes/EDC-generic-full.rdf']


def load_credential(path):
    doc = json.loads(Path(path).read_text(encoding='utf-8'))
    if 'payload' in doc and 'signatures' in doc:  # JAdES JSON serialisation, b64:false
        doc = json.loads(doc['payload'])
    if 'credential' in doc and '@context' not in doc:  # "uploadable" wrapper
        doc = doc['credential']
    inline = []
    for c in doc['@context']:
        inline.append(json.loads(CONTEXTS[c].read_text())['@context'] if isinstance(c, str) else c)
    doc['@context'] = inline
    return doc


def main(paths):
    shapes = rdflib.Graph()
    for f in SHAPES:
        shapes.parse(f)
    failed = False
    for path in paths:
        data = rdflib.Graph().parse(data=json.dumps(load_credential(path)), format='json-ld')
        conforms, report, text = pyshacl.validate(data, shacl_graph=shapes, inference='none', advanced=True)
        print(f'== {path}: {"CONFORMS" if conforms else "DOES NOT CONFORM"} ({len(data)} triples)')
        if not conforms:
            failed = True
            # One line per violation: focus node type, path, message
            sh = rdflib.Namespace('http://www.w3.org/ns/shacl#')
            for r in report.subjects(rdflib.RDF.type, sh.ValidationResult):
                sev = report.value(r, sh.resultSeverity).split('#')[-1]
                focus = report.value(r, sh.focusNode)
                ftype = data.value(focus, rdflib.RDF.type)
                rpath = report.value(r, sh.resultPath)
                msg = report.value(r, sh.resultMessage)
                print(f'  [{sev}] {ftype and ftype.split("/")[-1].split("#")[-1]} {rpath}: {msg}')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
