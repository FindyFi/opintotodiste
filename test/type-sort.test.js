import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

async function loadDetail() {
  const source = await readFile(new URL('../public/detail.js', import.meta.url), 'utf8')
  const context = vm.createContext({})
  return vm.runInContext(`${source}\nDetail`, context)
}

describe('sorting by type', () => {
  test('ranks the types from the highest level down, courses and assessments last', async () => {
    const { typeRank } = await loadDetail()
    const order = [
      'DoctoralDegree',
      'LicentiateDegree',
      'MasterDegree',
      'BachelorDegree',
      'AssociateDegree',
      'Degree',
      'Diploma',
      'SecondarySchoolDiploma',
      'Certificate',
      'Certification',
      'License',
      'ext:Something',
      'Course',
      'Assessment',
    ]
    const ranks = order.map(typeRank)
    assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b))
    assert.equal(typeRank('Diploma'), typeRank('SecondarySchoolDiploma'))
    assert.equal(typeRank('Certificate'), typeRank('License'))
  })

  test('puts an unknown or missing type between the qualifications and the courses', async () => {
    const { typeRank } = await loadDetail()
    for (const unknown of ['ext:Something', undefined, '']) {
      assert.ok(typeRank(unknown) > typeRank('License'), String(unknown))
      assert.ok(typeRank(unknown) < typeRank('Course'), String(unknown))
    }
  })

  test('is consistent with the qualifications the list marks as major', async () => {
    const { typeRank, isMajor } = await loadDetail()
    for (const type of ['DoctoralDegree', 'MasterDegree', 'Diploma', 'Certificate', 'License', 'Course', 'Assessment', 'ext:Other']) {
      assert.equal(isMajor({ achievementType: type }), typeRank(type) < typeRank('ext:Other'), type)
    }
  })

  test('is wired to the type column in the list', async () => {
    const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8')
    assert.match(source, /key === 'type'[\s\S]{0,200}compareByLevel/)
  })
})
