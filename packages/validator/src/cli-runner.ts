import { readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { shouldIncludeFile, walkFhirInput } from './cli-file-matching';
import { severityOf } from './cli-renderer';
import type { CliOptions, CliSummary, CliValidationIssue, FileResult } from './cli-types';
import { recordsValidator } from './index';
import { parseFhirNdjson, parseFhirXml } from './input';

interface FhirResourceLike {
  resourceType: string;
}

export interface CliRunResult {
  summary: CliSummary;
  results: FileResult[];
}

function isFhirResource(value: unknown): value is FhirResourceLike {
  return typeof value === 'object'
    && value !== null
    && typeof (value as { resourceType?: unknown }).resourceType === 'string';
}

export function findInputFiles(options: Pick<CliOptions, 'paths' | 'include' | 'exclude' | 'output'>): string[] {
  let files = Array.from(new Set(options.paths.flatMap((path) => Array.from(walkFhirInput(path))))).sort();
  if (files.length === 0) {
    throw new Error('No FHIR JSON, XML, or NDJSON files found.');
  }

  files = files.filter((file) => shouldIncludeFile(file, options));
  if (options.output) {
    const outputPath = resolve(options.output);
    files = files.filter((file) => resolve(file) !== outputPath);
  }
  if (files.length === 0) {
    throw new Error('No FHIR input files matched the include/exclude filters.');
  }

  return files;
}

export async function runValidation(files: string[], options: CliOptions): Promise<CliRunResult> {
  const results: FileResult[] = [];
  let totalErrors = 0;
  let totalWarnings = 0;
  let totalIssues = 0;

  for (const file of files) {
    let resources: FhirResourceLike[];
    try {
      resources = parseInputResources(file, readFileSync(file, 'utf8'));
    } catch (err) {
      totalErrors++;
      results.push({
        file,
        error: `Could not parse FHIR input: ${err instanceof Error ? err.message : String(err)}`,
        issues: [],
      });
      continue;
    }

    for (let resourceIndex = 0; resourceIndex < resources.length; resourceIndex++) {
      const resource = resources[resourceIndex];
      const resultFile = resources.length === 1 ? file : `${file}#${resourceIndex + 1}`;
      const profileUrl =
        options.profileUrl || `http://hl7.org/fhir/StructureDefinition/${resource.resourceType}`;

      try {
        const issues = await recordsValidator.validateRequest({
          resource,
          profileUrl,
          fhirVersion: options.fhirVersion,
        });
        const issueList: CliValidationIssue[] = Array.isArray(issues) ? issues : [];
        for (const issue of issueList) {
          totalIssues++;
          const severity = severityOf(issue);
          if (severity === 'error' || severity === 'fatal') totalErrors++;
          else if (severity === 'warning') totalWarnings++;
        }
        results.push({
          file: resultFile,
          resourceType: resource.resourceType,
          profileUrl,
          issues: issueList,
        });
      } catch (err) {
        totalErrors++;
        results.push({
          file: resultFile,
          resourceType: resource.resourceType,
          profileUrl,
          error: `Validator failed: ${err instanceof Error ? err.message : String(err)}`,
          issues: [],
        });
      }
    }
  }

  return {
    results,
    summary: {
      files: results.length,
      errors: totalErrors,
      warnings: totalWarnings,
      issues: totalIssues,
    },
  };
}

function parseInputResources(file: string, source: string): FhirResourceLike[] {
  const extension = extname(file).toLowerCase();
  if (extension === '.xml') {
    return requireFhirResources(parseFhirXml(source).resources, 'XML');
  }
  if (extension === '.ndjson') {
    return requireFhirResources(parseFhirNdjson(source).resources, 'NDJSON');
  }
  const parsed: unknown = JSON.parse(source);
  if (!isFhirResource(parsed)) {
    throw new Error('FHIR JSON input must contain an object with resourceType');
  }
  return [parsed];
}

function requireFhirResources(
  resources: Array<Record<string, unknown>>,
  format: string,
): FhirResourceLike[] {
  const valid: FhirResourceLike[] = [];
  for (const resource of resources) {
    if (!isFhirResource(resource)) {
      throw new Error(`FHIR ${format} input contains a record without resourceType`);
    }
    valid.push(resource);
  }
  return valid;
}
