import { describe, it, expect, vi } from 'vitest'
import { initializeApp } from 'firebase/app'
import { getFirestore, doc } from 'firebase/firestore'

vi.mock('@/lib/firebase', () => ({ firestore: {}, auth: {} }))
import { encodeDocId } from '@/services/firestoreSync'

const fs = getFirestore(initializeApp({ projectId: 'demo-test', apiKey: 'x', appId: 'x' }, 'docid-test'))

describe('encodeDocId — Firestore-safe document ids', () => {
  it('leaves slash-free ids byte-identical (no migration of existing docs)', () => {
    for (const id of [
      'default:txnCat:expense:식비',
      'alias:스타벅스 강남',
      '3f1a9c2e-1234-4abc-9def-0123456789ab',
    ]) {
      expect(encodeDocId(id)).toBe(id)
    }
  })

  it('makes a "/"-containing seed syncId usable as a doc id', () => {
    const bad = 'default:txnCat:expense:마트/편의점'
    const encoded = encodeDocId(bad)
    expect(encoded).not.toContain('/')
    // doc() threw on the raw value; the encoded value must be a valid doc ref.
    expect(() => doc(fs, `users/u1/transactionCategories/${bad}`)).toThrow()
    expect(() => doc(fs, `users/u1/transactionCategories/${encoded}`)).not.toThrow()
  })

  it('is injective: distinct syncIds map to distinct doc ids', () => {
    const samples = ['a/b', 'a~b', 'a~2fb', 'a/b/c', 'ab', 'a~7eb']
    const encoded = samples.map(encodeDocId)
    expect(new Set(encoded).size).toBe(samples.length)
  })
})
