#!/bin/sh

if [ $PULL_REQUEST = 'true' ]; then
  export PUBLIC_URL=$DEPLOY_PRIME_URL
else
  export PUBLIC_URL=$URL
fi

yarn build
