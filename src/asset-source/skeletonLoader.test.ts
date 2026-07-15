import { describe, expect, it } from 'vitest'
import { isMissingLocalSkeletonError } from './skeletonLoader'

describe('optional local skeleton errors', () => {
  const path = 'chara/human/c0201/skeleton/hair/h0001/skl_c0201h0001.sklb'

  it('recognizes an optional skeleton that is absent from every repository', () => {
    expect(isMissingLocalSkeletonError(
      new Error(`The selected install does not contain ${path} in ffxiv or ex1–ex5.`),
      path,
    )).toBe(true)
  })

  it('does not hide parsing and permission failures', () => {
    expect(isMissingLocalSkeletonError(new Error('Unsupported Havok skeleton layout.'), path)).toBe(false)
    expect(isMissingLocalSkeletonError(new Error('Read permission denied.'), path)).toBe(false)
  })
})
