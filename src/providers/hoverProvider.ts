/**
 * Hover Provider for detailed security information
 */

import * as vscode from 'vscode';
import { FileTypeDetector, FileType } from '../utils/fileTypeDetector';

export class SecurityHoverProvider implements vscode.HoverProvider {
    public provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Hover> {
        // Get diagnostics at the current position
        const diagnostics = vscode.languages.getDiagnostics(document.uri);

        const fcsdiagnostics = diagnostics.filter(diagnostic =>
            diagnostic.source === 'CrowdStrike FCS' &&
            diagnostic.range.contains(position)
        );

        if (fcsdiagnostics.length === 0) {
            // Check if we're hovering over security-related keywords
            const wordRange = document.getWordRangeAtPosition(position);
            if (wordRange) {
                const word = document.getText(wordRange).toLowerCase();
                // Use platform-aware keyword information (detects platform from any existing diagnostics)
                const securityInfo = this.getSecurityKeywordInfo(word, document, diagnostics);

                if (securityInfo) {
                    return new vscode.Hover(securityInfo, wordRange);
                }
            }
            return null;
        }

        // Create rich hover content for security diagnostics
        const hoverContents: vscode.MarkdownString[] = [];

        for (const diagnostic of fcsdiagnostics) {
            const content = this.createSecurityHoverContent(diagnostic, document, position);
            if (content) {
                hoverContents.push(content);
            }
        }

        if (hoverContents.length === 0) {
            return null;
        }

        return new vscode.Hover(hoverContents, fcsdiagnostics[0].range);
    }

    private createSecurityHoverContent(
        diagnostic: vscode.Diagnostic,
        document: vscode.TextDocument,
        position: vscode.Position
    ): vscode.MarkdownString | null {
        const content = new vscode.MarkdownString();
        // Do not set isTrusted=true — diagnostic.message comes from CLI output
        // and could contain command:// URIs if the CLI is compromised or malicious.

        // Add security finding header
        const severityIcon = this.getSeverityIcon(diagnostic.severity);
        const severityText = this.getSeverityText(diagnostic.severity);

        content.appendMarkdown(`## ${severityIcon} CrowdStrike FCS: Security Finding (${severityText})\n\n`);

        // Use appendText for CLI-derived content so markup is escaped rather than rendered
        content.appendMarkdown(`**Issue:** `);
        content.appendText(diagnostic.message);
        content.appendMarkdown(`\n\n`);


        // Add context-specific information
        const contextInfo = this.getContextualSecurityInfo(diagnostic, document);
        if (contextInfo) {
            content.appendMarkdown(contextInfo);
        }

        // Add remediation guidance
        const remediation = this.getRemediationGuidance(diagnostic, document);
        if (remediation) {
            content.appendMarkdown(`### 🔧 How to Fix\n\n${remediation}\n\n`);
        }

        // Add related resources
        const resources = this.getSecurityResources(diagnostic, document);
        if (resources) {
            content.appendMarkdown(`### 📚 Learn More\n\n${resources}\n\n`);
        }

        // Add quick actions

        return content;
    }

    private getSecurityKeywordInfo(word: string, document: vscode.TextDocument, diagnostics?: vscode.Diagnostic[]): vscode.MarkdownString | null {
        const securityKeywords: Record<string, string> = {
            'public': this.getPublicAccessInfo(document),
            'private': this.getPrivateAccessInfo(document),
            'encrypt': this.getEncryptionInfo(document),
            'encryption': this.getEncryptionInfo(document),
            'ssl': this.getSslInfo(document),
            'tls': this.getTlsInfo(document),
            'https': this.getHttpsInfo(document),
            'password': this.getPasswordInfo(document),
            'secret': this.getSecretInfo(document),
            'key': this.getKeyManagementInfo(document),
            'firewall': this.getFirewallInfo(document),
            'security': this.getSecurityGroupInfo(document),
            'privileged': this.getPrivilegedInfo(document),
            'root': this.getRootAccessInfo(document)
        };

        const info = securityKeywords[word];
        if (!info) {
            return null;
        }

        const content = new vscode.MarkdownString();
        // isTrusted not needed — content is static hardcoded strings, not CLI-derived
        content.appendMarkdown(info);
        return content;
    }

    private getContextualSecurityInfo(diagnostic: vscode.Diagnostic, document: vscode.TextDocument): string | null {
        const message = diagnostic.message.toLowerCase();

        // First try to extract platform from diagnostic (more reliable)
        const platformFromDiagnostic = this.extractPlatformFromDiagnostic(diagnostic);
        const fileType = platformFromDiagnostic || this.getFileType(document);

        console.log(`[SecurityHoverProvider] Using platform: ${fileType} (from diagnostic: ${platformFromDiagnostic ? 'yes' : 'no'})`);

        // Context-specific information based on platform and issue
        switch (fileType) {
            case 'terraform':
                return this.getTerraformContextInfo(message);
            case 'kubernetes':
                return this.getKubernetesContextInfo(message);
            case 'cloudformation':
                return this.getCloudFormationContextInfo(message);
            case 'dockerfile':
            case 'docker':
                return this.getDockerContextInfo(message);
            case 'ansible':
                return this.getAnsibleContextInfo(message);
            case 'azure':
                return this.getAzureContextInfo(message);
            case 'bicep':
                return this.getBicepContextInfo(message);
            case 'yaml':
                return this.getYamlContextInfo(message);
            case 'json':
                return this.getJsonContextInfo(message);
            default:
                return null;
        }

        return null;
    }

    private getRemediationGuidance(diagnostic: vscode.Diagnostic, document: vscode.TextDocument): string | null {
        const message = diagnostic.message.toLowerCase();

        // Common remediation patterns
        if (message.includes('public') && message.includes('bucket')) {
            return `
1. Set the S3 bucket ACL to "private"
2. Use bucket policies for controlled access
3. Enable bucket versioning and logging
4. Consider using S3 Block Public Access

\`\`\`hcl
resource "aws_s3_bucket" "example" {
  bucket = "my-bucket"
  acl    = "private"  # ✅ Secure
}
\`\`\`
            `;
        }

        if (message.includes('encrypt')) {
            return `
1. Enable encryption at rest
2. Use AWS KMS or similar key management
3. Ensure encryption in transit (HTTPS/TLS)
4. Rotate encryption keys regularly

\`\`\`hcl
server_side_encryption_configuration {
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}
\`\`\`
            `;
        }

        if (message.includes('security group') && message.includes('0.0.0.0')) {
            return `
1. Replace 0.0.0.0/0 with specific CIDR blocks
2. Use the principle of least privilege
3. Consider using AWS Security Group rules
4. Regularly audit security group rules

\`\`\`hcl
ingress {
  from_port   = 80
  to_port     = 80
  protocol    = "tcp"
  cidr_blocks = ["10.0.0.0/8"]  # ✅ Restricted
}
\`\`\`
            `;
        }

        return null;
    }

    private getSecurityResources(diagnostic: vscode.Diagnostic, document: vscode.TextDocument): string | null {
        const message = diagnostic.message.toLowerCase();
        const fileType = this.getFileType(document);

        let resources = `
- [CrowdStrike FCS Documentation](https://falcon.crowdstrike.com/documentation)
- [OWASP Security Guidelines](https://owasp.org/)
        `.trim();

        // Add file-type specific resources
        if (fileType === 'terraform') {
            resources += `
- [Terraform Security Best Practices](https://learn.hashicorp.com/tutorials/terraform/security)
- [AWS Security Best Practices](https://aws.amazon.com/security/security-resources/)
            `;
        } else if (fileType === 'kubernetes') {
            resources += `
- [Kubernetes Security Best Practices](https://kubernetes.io/docs/concepts/security/)
- [Pod Security Standards](https://kubernetes.io/docs/concepts/security/pod-security-standards/)
            `;
        } else if (fileType === 'dockerfile') {
            resources += `
- [Docker Security Best Practices](https://docs.docker.com/develop/security-best-practices/)
- [Container Security Guidelines](https://www.nist.gov/publications/application-container-security-guide)
            `;
        }

        return resources;
    }

    // Helper methods for security keyword information

    private getPublicAccessInfo(document: vscode.TextDocument): string {
        return `
### � Public Access

**Security Concern:** Public access can expose sensitive data or services to the internet.

**Best Practices:**
- Use private access whenever possible
- Implement proper authentication and authorization
- Regularly audit public access permissions
- Consider using CDNs or load balancers for legitimate public content
        `.trim();
    }

    private getEncryptionInfo(document: vscode.TextDocument): string {
        return `
### 🔐 Encryption

**Security Benefit:** Protects data confidentiality at rest and in transit.

**Implementation:**
- Enable encryption for storage services (S3, EBS, RDS)
- Use TLS/SSL for data in transit
- Implement proper key management (AWS KMS, etc.)
- Rotate encryption keys regularly
        `.trim();
    }

    private getPasswordInfo(document: vscode.TextDocument): string {
        return `
### 🔑 Password Security

**Security Concern:** Hardcoded passwords are a critical vulnerability.

**Best Practices:**
- Never hardcode passwords in configuration files
- Use environment variables or secrets management
- Implement password complexity requirements
- Enable multi-factor authentication (MFA)
        `.trim();
    }

    private getPrivilegedInfo(document: vscode.TextDocument): string {
        return `
### ⚠️ Privileged Access

**Security Risk:** Running with elevated privileges increases attack surface.

**Mitigation:**
- Run containers as non-root user
- Drop unnecessary Linux capabilities
- Use read-only root filesystems
- Implement proper RBAC (Role-Based Access Control)
        `.trim();
    }

    // Context-specific information methods

    private getTerraformContextInfo(message: string): string {
        return `
**Infrastructure Context:** This is a Terraform Infrastructure as Code (IaC) configuration. Security issues here affect your actual cloud infrastructure.

**Impact Level:** HIGH - Changes will affect live infrastructure resources.
        `.trim();
    }

    private getKubernetesContextInfo(message: string): string {
        return `
**Container Context:** This is a Kubernetes configuration affecting container security and cluster access.

**Impact Level:** MEDIUM-HIGH - Affects container runtime security and cluster resources.
        `.trim();
    }

    private getCloudFormationContextInfo(message: string): string {
        return `
**AWS Context:** This is an AWS CloudFormation template affecting cloud resource security.

**Impact Level:** HIGH - Changes affect AWS service configurations and access policies.
        `.trim();
    }

    private getDockerContextInfo(message: string): string {
        return `
**Container Context:** This is a Dockerfile affecting container image security.

**Impact Level:** MEDIUM - Affects container runtime environment and security posture.
        `.trim();
    }

    // Utility methods

    private getSeverityIcon(severity: vscode.DiagnosticSeverity): string {
        switch (severity) {
            case vscode.DiagnosticSeverity.Error:
                return '🚨';
            case vscode.DiagnosticSeverity.Warning:
                return '⚠️';
            case vscode.DiagnosticSeverity.Information:
                return 'ℹ️';
            default:
                return '🔍';
        }
    }

    private getSeverityText(severity: vscode.DiagnosticSeverity): string {
        switch (severity) {
            case vscode.DiagnosticSeverity.Error:
                return 'Critical/High';
            case vscode.DiagnosticSeverity.Warning:
                return 'Medium';
            case vscode.DiagnosticSeverity.Information:
                return 'Informational';
            default:
                return 'Unknown';
        }
    }

    private getFileType(document: vscode.TextDocument): string {
        const fileType = FileTypeDetector.getFileType(document);

        switch (fileType) {
            case FileType.TERRAFORM:
                return 'terraform';
            case FileType.YAML:
                // Detect if it's Kubernetes YAML
                const content = document.getText();
                if (content.includes('apiVersion') || content.includes('kind:')) {
                    return 'kubernetes';
                }
                return 'yaml';
            case FileType.JSON:
                // Detect if it's CloudFormation
                const jsonContent = document.getText();
                if (jsonContent.includes('AWSTemplateFormatVersion') || jsonContent.includes('Resources')) {
                    return 'cloudformation';
                }
                return 'json';
            case FileType.DOCKERFILE:
                return 'dockerfile';
            case FileType.BICEP:
                return 'bicep';
            default:
                return 'unknown';
        }
    }

    // Additional security info methods (abbreviated for brevity)
    private getPrivateAccessInfo(document: vscode.TextDocument): string {
        return `**Private Access:** Restricts access to authorized users only. ✅ Recommended for sensitive resources.`;
    }

    private getSslInfo(document: vscode.TextDocument): string {
        return `**SSL/TLS:** Encrypts data in transit between client and server. Always use for sensitive communications.`;
    }

    private getTlsInfo(document: vscode.TextDocument): string {
        return `**TLS:** Transport Layer Security - the modern standard for secure communications.`;
    }

    private getHttpsInfo(document: vscode.TextDocument): string {
        return `**HTTPS:** HTTP over TLS/SSL. Always use for web services handling sensitive data.`;
    }

    private getSecretInfo(document: vscode.TextDocument): string {
        return `**Secrets Management:** Store sensitive values in dedicated secret stores, never in code.`;
    }

    private getKeyManagementInfo(document: vscode.TextDocument): string {
        return `**Key Management:** Use dedicated services (AWS KMS, HashiCorp Vault) for cryptographic keys.`;
    }

    private getFirewallInfo(document: vscode.TextDocument): string {
        return `**Firewall Rules:** Control network traffic. Apply principle of least privilege.`;
    }

    private getSecurityGroupInfo(document: vscode.TextDocument): string {
        return `**Security Groups:** Virtual firewalls controlling inbound/outbound traffic to resources.`;
    }

    private getRootAccessInfo(document: vscode.TextDocument): string {
        return `**Root Access:** Administrative privileges. Avoid running processes as root when possible.`;
    }

    // Platform extraction from diagnostics
    private extractPlatformFromDiagnostic(diagnostic: vscode.Diagnostic): string | null {
        if (!diagnostic || diagnostic.source !== 'CrowdStrike FCS') {
            return null;
        }

        // Try to extract platform from diagnostic message or code
        const message = diagnostic.message.toLowerCase();
        const code = diagnostic.code?.toString().toLowerCase() || '';

        // Platform detection patterns based on FCS CLI output
        if (message.includes('terraform') || code.includes('terraform')) {
            return 'terraform';
        }
        if (message.includes('kubernetes') || message.includes('k8s') || code.includes('kubernetes')) {
            return 'kubernetes';
        }
        if (message.includes('cloudformation') || message.includes('cfn') || code.includes('cloudformation')) {
            return 'cloudformation';
        }
        if (message.includes('docker') || code.includes('docker')) {
            return 'dockerfile';
        }
        if (message.includes('ansible') || code.includes('ansible')) {
            return 'ansible';
        }
        if (message.includes('azure') || message.includes('arm') || code.includes('azure')) {
            return 'azure';
        }
        if (message.includes('bicep') || code.includes('bicep')) {
            return 'bicep';
        }

        // Check if the diagnostic has additional metadata we can use

        return null;
    }

    // Additional platform context methods
    private getAnsibleContextInfo(message: string): string {
        return `
**Automation Context:** This is an Ansible playbook affecting infrastructure automation and configuration management.

**Impact Level:** MEDIUM-HIGH - Affects automated deployment and configuration of infrastructure.
        `.trim();
    }

    private getAzureContextInfo(message: string): string {
        return `
**Cloud Context:** This is an Azure Resource Manager (ARM) template or configuration affecting Azure cloud resources.

**Impact Level:** HIGH - Changes affect Azure service configurations and access policies.
        `.trim();
    }

    private getBicepContextInfo(message: string): string {
        return `
**Cloud Context:** This is an Azure Bicep file that defines Azure cloud infrastructure.

**Impact Level:** HIGH - Changes affect Azure resource configurations and access policies.
        `.trim();
    }

    private getYamlContextInfo(message: string): string {
        return `
**Configuration Context:** This is a YAML configuration file that may define infrastructure, automation, or API specifications.

**Impact Level:** MEDIUM-HIGH - Security issues in configuration files can affect runtime behavior, access control, or deployed infrastructure.
        `.trim();
    }

    private getJsonContextInfo(message: string): string {
        return `
**Configuration Context:** This is a JSON configuration file that may define infrastructure, service settings, or API specifications.

**Impact Level:** MEDIUM - Security issues in configuration files can expose sensitive settings or misconfigure deployed services.
        `.trim();
    }
}

export default SecurityHoverProvider;
