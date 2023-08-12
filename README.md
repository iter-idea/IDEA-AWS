# IDEA AWS

AWS wrappers to use in IDEA's back-ends; note: internally we use AWS-SDK _v3_.

## Installation

`npm i idea-aws`

## Usage example

```
import { ResourceController } from 'idea-aws';
```

## Documentation

Documentation generated with TypeDoc: [link](https://iter-idea.github.io/IDEA-AWS).

## Notes

The AWS-SDK (v3) is already pre-installed in every Lambda Function; therefore, the clients are all in `devDependency`.
