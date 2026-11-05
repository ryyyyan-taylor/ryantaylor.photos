terraform {
  required_version = ">= 1.10"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }

  # R2 via the S3 backend; credentials come from AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY.
  backend "s3" {
    bucket                      = "ryantaylor-photos-tfstate"
    key                         = "site/terraform.tfstate"
    region                      = "auto"
    endpoints                   = { s3 = "https://ef762a2c4ac0f98eefb7dae78f871eb9.r2.cloudflarestorage.com" }
    use_path_style              = true
    use_lockfile                = true
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_s3_checksum            = true
  }
}
