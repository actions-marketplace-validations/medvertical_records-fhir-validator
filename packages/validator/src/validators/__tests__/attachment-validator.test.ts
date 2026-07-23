import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AttachmentValidator } from '../attachment-validator';

describe('AttachmentValidator', () => {
  const validator = new AttachmentValidator();

  it('reports mismatched decoded size and SHA-1 hash', () => {
    const data = Buffer.from('attachment bytes').toString('base64');
    const resource = {
      resourceType: 'DocumentReference',
      content: [{
        attachment: {
          contentType: 'text/plain',
          data,
          size: 999,
          hash: Buffer.alloc(20, 1).toString('base64'),
        },
      }],
    };

    const issues = validator.validate(resource);

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'structural-attachment-size-mismatch',
        severity: 'error',
        path: 'DocumentReference.content[0].attachment',
      }),
      expect.objectContaining({
        code: 'structural-attachment-hash-mismatch',
        severity: 'error',
        path: 'DocumentReference.content[0].attachment',
        details: expect.objectContaining({ hashAlgorithm: 'SHA-1' }),
      }),
    ]));
  });

  it('accepts matching size and SHA-1 hash', () => {
    const bytes = Buffer.from('attachment bytes');
    const resource = {
      resourceType: 'DocumentReference',
      content: [{
        attachment: {
          contentType: 'text/plain',
          data: bytes.toString('base64'),
          size: bytes.length,
          hash: createHash('sha1').update(bytes).digest('base64'),
        },
      }],
    };

    expect(validator.validate(resource)).toHaveLength(0);
  });
});
