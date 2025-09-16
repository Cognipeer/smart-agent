---
title: Contributing to Docs
nav_exclude: true
---

# Contributing to Documentation

 Pages live under `docs/` and are rendered by GitHub Pages with the Just the Docs theme.
 Each page should start with YAML front matter including at least `title` and optionally `nav_order`.
 Section landing pages use the directory `README.md` pattern.

## Local preview (optional)

You can preview locally with Docker, without installing Ruby:

```sh
docker run --rm -p 4000:4000 -v "$PWD/docs":/site -w /site bretfisher/jekyll-serve
```

Then open http://localhost:4000.

If you prefer Ruby:

```sh
gem install bundler jekyll
cd docs && bundle init && echo 'gem "just-the-docs"' >> Gemfile && bundle && bundle exec jekyll serve
```

Note: GitHub Pages will build automatically on pushes to the default branch when Pages is enabled for this repo and the source is set to the `docs/` folder.
