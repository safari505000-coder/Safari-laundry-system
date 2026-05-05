/** REGION=primary|secondary — secondary regions should minimize writers; workers safe with BullMQ. */
export function deploymentRegion(): string {
  return (process.env.REGION ?? 'primary').toLowerCase();
}

export function isSecondaryRegion(): boolean {
  return deploymentRegion() === 'secondary';
}

export function deploymentColor(): string {
  return (
    process.env.DEPLOYMENT_COLOR ??
    process.env.DEPLOYMENT_SLOT ??
    'blue'
  ).toLowerCase();
}
