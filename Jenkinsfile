pipeline {
  agent any

  triggers {
    // Poll GitHub every 2 minutes for changes
    pollSCM('H/2 * * * *')
  }

  environment {
    REGISTRY = "docker.io/chriskolb00"
    APP = "myapp"
    NAMESPACE = "myapp"
    TAG = "${env.GIT_COMMIT}".take(12)
  }

  options {
    timestamps()
    disableConcurrentBuilds()
  }

  stages {

    stage("Checkout") {
      steps {
        checkout scm
        sh "git rev-parse --short=12 HEAD"
      }
    }

    stage("Unit Tests") {
      steps {
        script {
          // Check if npm is available
          def npmAvailable = sh(script: 'command -v npm', returnStatus: true) == 0
          
          if (npmAvailable) {
            parallel(
              "API Tests": {
                sh "cd services/api && npm ci && npm test"
              },
              "Worker Tests": {
                sh "cd services/worker && npm ci && npm test"
              },
              "Frontend Tests": {
                sh "cd services/frontend && npm ci && npm test || true"
              }
            )
          } else {
            echo "⚠️  npm not found - skipping unit tests"
            echo "💡 To run tests, install Node.js in your Jenkins agent or use a NodeJS tool installation"
          }
        }
      }
    }

    stage("Build & Push Images") {
      steps {
        script {
          // Check if docker is available
          def dockerAvailable = sh(script: 'command -v docker', returnStatus: true) == 0
          
          if (!dockerAvailable) {
            echo "⚠️  Docker not found in Jenkins agent - skipping image build"
            echo "💡 To build images, ensure Docker is available in your Jenkins container"
            echo "   You can mount the Docker socket: -v /var/run/docker.sock:/var/run/docker.sock"
            return
          }
          
          // Test Docker socket access
          def dockerWorks = sh(script: 'docker ps >/dev/null 2>&1', returnStatus: true) == 0
          
          if (!dockerWorks) {
            echo "⚠️  Docker found but cannot access Docker daemon - permission denied"
            echo "💡 Fix: Add Jenkins user to docker group:"
            echo "   sudo usermod -aG docker jenkins"
            echo "   or: sudo chmod 666 /var/run/docker.sock"
            echo "   Then restart Jenkins"
            return
          }
          
          // Check if Docker registry credentials exist
          def credsExist = false
          try {
            withCredentials([usernamePassword(credentialsId: "docker-registry-creds", usernameVariable: "DOCKER_USER", passwordVariable: "DOCKER_PASS")]) {
              credsExist = true
            }
          } catch (Exception e) {
            credsExist = false
          }
          
          if (credsExist) {
            withCredentials([usernamePassword(credentialsId: "docker-registry-creds", usernameVariable: "DOCKER_USER", passwordVariable: "DOCKER_PASS")]) {
              sh """
                echo "\$DOCKER_PASS" | docker login -u "\$DOCKER_USER" --password-stdin
                
                docker build -t $REGISTRY/$APP-api:$TAG services/api
                docker build -t $REGISTRY/$APP-worker:$TAG services/worker
                docker build -t $REGISTRY/$APP-frontend:$TAG services/frontend
                
                docker push $REGISTRY/$APP-api:$TAG
                docker push $REGISTRY/$APP-worker:$TAG
                docker push $REGISTRY/$APP-frontend:$TAG
              """
            }
            echo "✅ Images built and pushed to registry"
          } else {
            echo "⚠️  Docker registry credentials not found - building locally only"
            sh """
              docker build -t $REGISTRY/$APP-api:$TAG services/api
              docker build -t $REGISTRY/$APP-worker:$TAG services/worker
              docker build -t $REGISTRY/$APP-frontend:$TAG services/frontend
            """
            echo "✅ Images built locally (not pushed to registry)"
          }
        }
      }
    }

    stage("Deploy to Kubernetes (Dev)") {
      steps {
        script {
          // Check if kubeconfig credentials exist
          def kubeConfigExists = false
          try {
            withCredentials([file(credentialsId: "kubeconfig-mycluster", variable: "KUBECONFIG_FILE")]) {
              kubeConfigExists = true
            }
          } catch (Exception e) {
            kubeConfigExists = false
          }
          
          if (kubeConfigExists) {
            withCredentials([file(credentialsId: "kubeconfig-mycluster", variable: "KUBECONFIG_FILE")]) {
              sh """
                export KUBECONFIG=\$KUBECONFIG_FILE

                # Apply namespace and basic resources
                kubectl apply -f k8s/dev.yaml

                # Update image tags to newly built versions
                kubectl set image deployment/api api=$REGISTRY/$APP-api:$TAG -n $NAMESPACE
                kubectl set image deployment/worker worker=$REGISTRY/$APP-worker:$TAG -n $NAMESPACE
                kubectl set image deployment/frontend frontend=$REGISTRY/$APP-frontend:$TAG -n $NAMESPACE

                # Wait for rollout to complete
                kubectl rollout status deployment/api -n $NAMESPACE --timeout=180s
                kubectl rollout status deployment/worker -n $NAMESPACE --timeout=180s
                kubectl rollout status deployment/frontend -n $NAMESPACE --timeout=180s
              """
            }
            echo "✅ Deployed to Kubernetes successfully!"
          } else {
            echo "⚠️  Kubeconfig credentials not found - skipping Kubernetes deployment"
            echo "💡 Add 'kubeconfig-mycluster' credentials in Jenkins to enable deployments"
          }
        }
      }
    }

    stage("Smoke Test") {
      steps {
        script {
          // Check if kubeconfig credentials exist
          def kubeConfigExists = false
          try {
            withCredentials([file(credentialsId: "kubeconfig-mycluster", variable: "KUBECONFIG_FILE")]) {
              kubeConfigExists = true
            }
          } catch (Exception e) {
            kubeConfigExists = false
          }
          
          if (kubeConfigExists) {
            withCredentials([file(credentialsId: "kubeconfig-mycluster", variable: "KUBECONFIG_FILE")]) {
              sh """
                export KUBECONFIG=\$KUBECONFIG_FILE
                # Example: port-forward API and hit /health
                kubectl -n \$NAMESPACE port-forward svc/api 13000:3000 >/tmp/pf.log 2>&1 &
                PF_PID=\$!
                sleep 2
                curl -fsS http://127.0.0.1:13000/health
                kill \$PF_PID
              """
            }
          } else {
            echo "⚠️  Skipping smoke test (no kubeconfig)"
          }
        }
      }
    }
  }

  post {
    always {
      cleanWs()
    }
  }
}
