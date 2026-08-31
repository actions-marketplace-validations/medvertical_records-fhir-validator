export interface PackageManifest {
  name: string;
  'dist-tags': {
    latest?: string;
    [key: string]: string | undefined;
  };
  versions: Record<string, PackageVersion>;
}

export interface PackageVersion {
  name: string;
  version: string;
  description?: string;
  dist: {
    tarball: string;
    shasum?: string;
  };
  fhirVersion?: string | string[];
  dependencies?: Record<string, string>;
}

export interface PackageInfo {
  packageId: string;
  version: string;
  tarballUrl: string;
  fhirVersion?: string | string[];
}
