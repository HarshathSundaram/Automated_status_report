pipeline {
    agent any

    triggers {
        // Daily at 10:30 AM IST (05:00 UTC)
        cron('0 5 * * *')
        // Poll GitHub every 5 minutes for new commits
        pollSCM('H/5 * * * *')
    }

    options {
        timeout(time: 10, unit: 'MINUTES')
        buildDiscarder(logRotator(daysToKeepStr: '2'))
    }

    environment {
        JIRA_BASE_URL    = credentials('WT_JIRA_BASE_URL')
        JIRA_EMAIL       = credentials('WT_JIRA_EMAIL')
        JIRA_API_TOKEN   = credentials('WT_JIRA_API_TOKEN')
        GCHAT_WEBHOOK_URL = credentials('WT_GCHAT_WEBHOOK_URL')
        BOARD_ID         = credentials('WT_BOARD_ID')
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Run Report') {
            steps {
                script {
                    // Use Docker if available, otherwise run Python directly
                    def dockerAvailable = sh(script: 'docker info > /dev/null 2>&1 && echo yes || echo no', returnStdout: true).trim()

                    if (dockerAvailable == 'yes') {
                        echo 'Running via Docker...'
                        sh '''
                            docker build -t wt-daily-report .
                            mkdir -p logs
                            docker run --rm \
                                -e JIRA_BASE_URL="$JIRA_BASE_URL" \
                                -e JIRA_EMAIL="$JIRA_EMAIL" \
                                -e JIRA_API_TOKEN="$JIRA_API_TOKEN" \
                                -e GCHAT_WEBHOOK_URL="$GCHAT_WEBHOOK_URL" \
                                -e BOARD_ID="$BOARD_ID" \
                                -v "$WORKSPACE/logs:/app/logs" \
                                wt-daily-report
                        '''
                    } else {
                        echo 'Docker not available — running Python directly...'
                        sh '''
                            python3 -m venv venv
                            venv/bin/pip install -q -r requirements.txt
                            mkdir -p logs
                            venv/bin/python wt_report.py
                        '''
                    }
                }
            }
        }
    }

    post {
        always {
            // Archive logs for 2 days (matches GitHub Actions retention)
            archiveArtifacts artifacts: 'logs/*.log', allowEmptyArchive: true
        }
        success {
            echo 'WT Board report posted successfully.'
        }
        failure {
            echo 'WT Board report FAILED. Check logs above.'
        }
    }
}
