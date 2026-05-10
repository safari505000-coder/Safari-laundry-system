/** REGION env tag — surfaced on /healthz so blue/green and primary/secondary deploys are distinguishable in dashboards. */
export function deploymentRegion(): string {
  return (process.env.REGION ?? 'primary').toLowerCase();
}

export function deploymentColor(): string {
  return (
    process.env.DEPLOYMENT_COLOR ??
    process.env.DEPLOYMENT_SLOT ??
    'blue'
  ).toLowerCase();
}
