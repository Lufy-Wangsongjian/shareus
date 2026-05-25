# Google Cloud Deployment

## Live URLs

| Service | URL |
|---------|-----|
| **Web（给朋友用）** | https://shareus-web-w7zx5u5teq-de.a.run.app |
| **API** | https://shareus-api-w7zx5u5teq-de.a.run.app |
| **管理页** | https://shareus-web-w7zx5u5teq-de.a.run.app/admin |

## 给朋友用的流程

1. 你在 **管理页** 导入视频、转码、创建房间，设置房间密码
2. 把房间链接发给朋友，例如：
   `https://shareus-web-w7zx5u5teq-de.a.run.app/room/room_xxxxx`
3. 朋友打开链接，输入**房间密码**即可一起观影

## Required services

- Cloud Run（API + Web）
- Cloud Run Jobs（转码 worker）
- Firestore Native mode
- Cloud Storage
- Artifact Registry

## Storage

Bucket: `gs://shareus-videos-lufywang-2026`

手动上传源视频到 `uploads/` 目录，然后在管理页导入路径。

## 重新部署

```bash
PROJECT=gen-lang-client-0710375342
REGION=asia-east1
API_URL=https://shareus-api-w7zx5u5teq-de.a.run.app

# 构建并部署 API
gcloud builds submit . --project=$PROJECT \
  --config=infra/cloudbuild.api.yaml \
  --substitutions=_IMAGE=asia-east1-docker.pkg.dev/$PROJECT/shareus/api:latest

gcloud run deploy shareus-api \
  --image=asia-east1-docker.pkg.dev/$PROJECT/shareus/api:latest \
  --region=$REGION --project=$PROJECT

# 构建并部署 Web（需传入 API 地址）
gcloud builds submit . --project=$PROJECT \
  --config=infra/cloudbuild.web.yaml \
  --substitutions=_IMAGE=asia-east1-docker.pkg.dev/$PROJECT/shareus/web:latest,_API_URL=$API_URL

gcloud run deploy shareus-web \
  --image=asia-east1-docker.pkg.dev/$PROJECT/shareus/web:latest \
  --region=$REGION --project=$PROJECT
```

## 转码 Job

大文件（>5GB）建议 **16Gi 内存**：

```bash
gcloud run jobs update shareus-transcoder \
  --region=$REGION --project=$PROJECT \
  --memory=16Gi --cpu=4 --task-timeout=86400s --max-retries=1
```

查看转码进度：

```bash
gcloud run jobs executions list --job=shareus-transcoder --region=$REGION --project=$PROJECT
```

## Secrets

生产环境建议把以下变量迁到 Secret Manager，而不是明文写在 Cloud Run 环境变量里：

- `ADMIN_PASSWORD`
- `ADMIN_TOKEN_SECRET`
- `ROOM_TOKEN_SECRET`

## 费用说明

Cloud Run 按实际使用计费，无流量时 scale to zero 不产生计算费用。转码 Job 按运行时长 + CPU/内存计费。
