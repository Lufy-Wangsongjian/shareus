import { GoogleAuth } from "google-auth-library";
import type { AppConfig } from "../config.js";

export function createCloudRunJobStarter(config: AppConfig) {
  const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  const jobName = `projects/${config.gcpProjectId}/locations/${config.transcoderRegion}/jobs/${config.transcoderJobName}`;

  return async function startJob(env: Record<string, string>): Promise<void> {
    const client = await auth.getClient();
    const url = `https://run.googleapis.com/v2/${jobName}:run`;
    const response = await client.request({
      url,
      method: "POST",
      data: {
        overrides: {
          containerOverrides: [{
            env: Object.entries(env).map(([name, value]) => ({ name, value }))
          }]
        }
      }
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Cloud Run Job start failed with status ${response.status}`);
    }
  };
}
