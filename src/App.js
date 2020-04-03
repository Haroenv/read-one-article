import React, {
  useState,
  useEffect,
  useReducer,
  useRef,
  Suspense,
} from 'react';
import { useTranslation, Trans } from 'react-i18next';
import raw from 'raw.macro';

const numArticles = 2;

function getMinContentLength(language) {
  switch (language) {
    case 'simple': {
      return 500;
    }
    case 'en': {
      return 10_000;
    }
    default: {
      return 5_000;
    }
  }
}

function createWikiURL(language, params) {
  const url = new URL(`https://${language}.wikipedia.org/w/api.php`);

  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  return url;
}

// https://stackoverflow.com/a/12646864/3185307
function shuffle(array) {
  const shuffledArray = array.slice();

  for (let i = shuffledArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledArray[i], shuffledArray[j]] = [shuffledArray[j], shuffledArray[i]];
  }

  return shuffledArray;
}

function useRandomWikiArticles({
  minContentLength,
  length,
  language,
  requestInvalidator,
}) {
  const [loading, setLoading] = useState(false);
  const [randomArticles, setRandomArticles] = useState();
  const [error, setError] = useState();

  useEffect(() => {
    setLoading(true);
    const url = createWikiURL(language, {
      format: 'json',
      action: 'query',
      generator: 'random',
      prop: 'info',
      inprop: 'url',
      grnlimit: 50,
      grnnamespace: 0,
      origin: '*',
    });

    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (data?.query?.pages) {
          setLoading(false);
          setRandomArticles(
            Object.values(data.query.pages)
              .filter(
                page =>
                  page.length > minContentLength &&
                  !page.title.startsWith('List of')
              )
              .slice(0, length)
          );
        } else {
          throw new Error(
            "data doesn't fit expected format: " + JSON.stringify(data)
          );
        }
      })
      .catch(e => {
        setLoading(false);
        setError(e);
      });

    return () => {
      setLoading(false);
    };
  }, [minContentLength, requestInvalidator, language, length]);

  return {
    loading,
    error,
    randomArticles,
  };
}

function WikipediaIframe({ article, language }) {
  const { t } = useTranslation();
  const iframe = useRef();

  useEffect(() => {
    const url = createWikiURL(language, {
      format: 'json',
      action: 'parse',
      pageid: article.pageid,
      mobileformat: true,
      prop: 'text',
      origin: '*',
    });

    fetch(url)
      .then(res => res.json())
      .then(res => {
        if (!iframe || !iframe.current) {
          return;
        }
        const document = iframe.current.contentDocument;
        const style = document.createElement('style');
        style.innerHTML = raw('./wikipedia.css');
        document.head.appendChild(style);

        document.body.innerHTML = `
          <base href="https://${language}.wikipedia.org" />
          <h1>${article.title}</h1>
          <div class="siteSub">${t('from-wikipedia')}</div>
          ${res.parse.text['*']}`;

        document.querySelectorAll('a').forEach(el =>
          el.addEventListener('click', e => {
            const target = e.currentTarget || e.target;
            if (target.href[0] !== '#') {
              e.preventDefault();
            }
          })
        );
      });
  }, [article.pageid, article.title, language, t]);

  return (
    <iframe
      ref={iframe}
      frameBorder="0"
      title={`Wikipedia page for ${article.title}`}
    />
  );
}

function Share() {
  const { t } = useTranslation();
  const [hasShareApi, setHasShareApi] = useState(
    // Safari's share API doesnt do social, so it's useless
    'share' in navigator && navigator.platform !== 'MacIntel'
  );
  const [shared, setShared] = useState(false);

  const shareTitle = 'Read One Article';
  const shareText = t('tweet-text');
  const shareUrl = window.location.href;

  const tweetUrl = new URL('https://twitter.com/intent/tweet');
  tweetUrl.searchParams.set('url', shareUrl);
  tweetUrl.searchParams.set('text', shareText);

  return (
    <>
      {shared && !hasShareApi && (
        <input type="text" readOnly value={shareUrl} />
      )}
      <a
        href={tweetUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={e => {
          setShared(true);
          if (hasShareApi) {
            e.preventDefault();
            navigator
              .share({
                title: shareTitle,
                text: shareText,
                url: shareUrl,
              })
              .catch(() => setHasShareApi(null));
          }
        }}
      >
        {t('game.share')}
      </a>
    </>
  );
}

function Loading({ children = 'loading…' }) {
  const [showText, setShowText] = useState(false);

  useEffect(() => {
    let visible = true;

    setTimeout(() => {
      if (visible) {
        setShowText(true);
      }
    }, 200);

    return () => {
      visible = false;
    };
  });

  if (!showText) {
    return null;
  }

  return <div className="full-center">{children}</div>;
}

// stage:
// 1. choosing
// 2. reading
// 3. guessing
// 4. recap
// 5? finish

function init({
  liar,
  investigator,
  points,
  chosenArticles = [],
  nonChosenArticles = [],
}) {
  return {
    liar,
    investigator,
    points,
    stage: 'choosing',
    chosenArticle: null,
    guessCorrect: false,
    chosenArticles,
    nonChosenArticles,
  };
}

function reducer(state, action) {
  switch (action.type) {
    case 'choose article': {
      const { article, allArticles } = action.payload;
      return {
        ...state,
        chosenArticle: article,
        chosenArticles: state.chosenArticles.concat(article),
        nonChosenArticles: state.nonChosenArticles.concat(
          allArticles.filter(art => art !== article)
        ),
        stage: 'reading',
      };
    }
    case 'done reading': {
      return {
        ...state,
        stage: 'preguessing',
      };
    }
    case 'start guessing': {
      return {
        ...state,
        stage: 'guessing',
      };
    }
    case 'guess': {
      const { chosenArticle, liar, investigator, points } = state;
      const guessCorrect = action.payload === chosenArticle;

      return {
        ...state,
        stage: 'recap',
        guessCorrect,
        points: {
          [liar]: guessCorrect ? points[liar] : points[liar] + 1,
          [investigator]: guessCorrect
            ? points[investigator] + 1
            : points[investigator],
        },
      };
    }
    case 'next round': {
      const {
        investigator,
        liar,
        points,
        chosenArticles,
        nonChosenArticles,
      } = state;
      return init({
        liar: investigator,
        investigator: liar,
        points,
        chosenArticles,
        nonChosenArticles,
      });
    }
    case 'finish': {
      return {
        ...state,
        stage: 'finish',
      };
    }
    default: {
      throw new Error('wrong dispatch');
    }
  }
}

function TwoPlayerGame({ names, stop, language }) {
  const [
    {
      liar,
      investigator,
      stage,
      chosenArticle,
      guessCorrect,
      points,
      chosenArticles,
      nonChosenArticles,
    },
    dispatch,
  ] = useReducer(
    reducer,
    {
      liar: names[0],
      investigator: names[1],
      points: Object.fromEntries(names.map(name => [name, 0])),
    },
    init
  );
  const { t } = useTranslation();
  const [retryCount, setRetryCount] = useState(0);
  const retry = () => setRetryCount(count => count + 1);
  const { loading, error, randomArticles } = useRandomWikiArticles({
    minContentLength: getMinContentLength(language),
    length: numArticles,
    requestInvalidator: [liar, retryCount].join('~~~'),
    language,
  });

  if (loading) {
    return <Loading>{t('loading…')}</Loading>;
  }

  if (error || !randomArticles || randomArticles.length < numArticles) {
    return (
      <div className="full-center">
        <div>
          <p>Error: {error?.message || 'no data'}</p>
          <button type="button" onClick={() => retry()}>
            {t('game.try-again')}
          </button>
        </div>
      </div>
    );
  }

  if (stage === 'choosing') {
    return (
      <div className="full-center">
        <div>
          <p>
            <Trans i18nKey="game.choosing">
              It is now the turn of the liar ({{ liar }}). To read up on one
              topic, please pick one of these articles:
            </Trans>
          </p>
          <ul className="box-list">
            {shuffle(randomArticles).map((article, i) => (
              <li key={article.pageid}>
                <button
                  type="button"
                  onClick={() =>
                    dispatch({
                      type: 'choose article',
                      payload: { article, allArticles: randomArticles },
                    })
                  }
                >
                  <Trans i18nKey="game.article">
                    Article {{ number: i + 1 }}
                  </Trans>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  if (stage === 'reading') {
    return (
      <div className="flex-column full-size">
        <WikipediaIframe article={chosenArticle} language={language} />
        <button
          className="done-reading"
          type="button"
          onClick={() => dispatch({ type: 'done reading' })}
        >
          {t('game.done-reading')}
        </button>
      </div>
    );
  }

  if (stage === 'preguessing') {
    return (
      <div className="full-center">
        <div>
          <p>
            <Trans i18nKey="game.preguessing">
              Please give the device to {{ investigator }}
            </Trans>
          </p>
          <button
            type="button"
            onClick={() => dispatch({ type: 'start guessing' })}
          >
            {t('game.start-guessing')}
          </button>
        </div>
      </div>
    );
  }

  if (stage === 'guessing') {
    return (
      <div className="full-center">
        <div>
          <p>
            <Trans i18nKey="game.guessing">
              It is now the turn of the investigator ({{ investigator }}). You
              now can ask questions about all these articles. Once you think you
              know which article the person read, make a guess!
            </Trans>
          </p>
          <ul className="box-list">
            {randomArticles.map(article => (
              <li key={article.pageid}>
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'guess', payload: article })}
                >
                  {article.title}
                </button>
              </li>
            ))}
          </ul>
          <p>{t('game.scratchpad')}</p>
          <textarea rows={5} placeholder={t('game.scratchpad-tips')} />
        </div>
      </div>
    );
  }

  if (stage === 'recap') {
    return (
      <div className="full-center">
        <div>
          <p>
            {guessCorrect ? (
              <Trans i18nKey="game.investigator-won">
                The investigator, {{ investigator }} won! {{ liar }} did read
                about {{ title: chosenArticle.title }}
              </Trans>
            ) : (
              <Trans i18nKey="game.liar-won">
                The liar, {{ liar }} won! {{ liar }} actually read about{' '}
                {{ title: chosenArticle.title }}
              </Trans>
            )}
          </p>
          <p>{t('game.read-articles')}</p>
          <ul className="box-list">
            {randomArticles.map(article => (
              <li key={article.pageid}>
                <a
                  href={article.fullurl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {article.title}
                </a>
              </li>
            ))}
          </ul>
          <p>{t('game.scores')}:</p>
          <ul className="scores-list">
            {Object.entries(points).map(([name, score]) => (
              <li key={name}>
                {name}: {score}
              </li>
            ))}
          </ul>
          <ul className="box-list">
            <li>
              <button
                type="button"
                onClick={() => dispatch({ type: 'next round' })}
              >
                {t('game.start-next')}
              </button>
            </li>
            <li>
              <button
                className="danger"
                type="button"
                onClick={() => dispatch({ type: 'finish' })}
              >
                {t('game.stop-playing')}
              </button>
            </li>
          </ul>
        </div>
      </div>
    );
  }

  if (stage === 'finish') {
    return (
      <div className="full-center">
        <div>
          <p>{t('game.final-score')}</p>
          <ul className="scores-list">
            {Object.entries(points).map(([name, score]) => (
              <li key={name}>
                {name}: {score}
              </li>
            ))}
          </ul>
          <p>{t('game.did-read')}</p>
          <ul className="box-list vertical">
            {chosenArticles.map(article => (
              <li key={article.pageid}>
                <a
                  href={article.fullurl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {article.title}
                </a>
              </li>
            ))}
          </ul>
          <hr />
          <p>{t('game.didnt-read')}</p>
          <ul className="box-list vertical">
            {nonChosenArticles.map(article => (
              <li key={article.pageid}>
                <a
                  href={article.fullurl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {article.title}
                </a>
              </li>
            ))}
          </ul>
          <hr />
          <ul className="box-list">
            <li>
              <Share />
            </li>
            <li>
              <a
                href="https://github.com/haroenv/read-one-article"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('game.contribute')}
              </a>
            </li>
            <li>
              <button type="button" onClick={() => stop()}>
                {t('game.new-game')}
              </button>
            </li>
          </ul>
        </div>
      </div>
    );
  }

  return t('game.error');
}

function App() {
  const { t, i18n } = useTranslation();

  const [started, setStarted] = useState(false);
  const [nameOne, setNameOne] = useState();
  const [nameTwo, setNameTwo] = useState();
  const [languages, setLanguages] = useState([]);

  useEffect(() => {
    const url = createWikiURL('en', {
      action: 'query',
      format: 'json',
      prop: 'langlinks',
      llprop: 'autonym',
      titles: 'Main Page',
      lllimit: '50',
      origin: '*',
    });

    fetch(url)
      .then(res => res.json())
      .then(res => {
        if (typeof res?.query?.pages === 'object') {
          const mainPage = Object.values(res.query.pages)[0];
          if (Array.isArray(mainPage?.langlinks)) {
            setLanguages(
              mainPage.langlinks.map(({ lang, autonym }) => ({ lang, autonym }))
            );
          }
        }
      })
      .catch(() => {});
  }, []);

  const start = () => setStarted(true);
  const stop = () => setStarted(false);

  if (started) {
    return (
      <TwoPlayerGame
        names={[nameOne, nameTwo]}
        stop={stop}
        language={i18n.language}
      />
    );
  }

  return (
    <div className="full-center intro">
      <div className="intro-header">
        <h1>Read One Article</h1>
      </div>

      <div className="intro-content">
        {t('intro.text', { returnObjects: true }).map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>

      <form
        className="intro-form flex-column child-spacing"
        onSubmit={e => {
          e.preventDefault();
          start();
        }}
      >
        <label>
          <span>{t('intro.language')}</span>
          <select
            className="language"
            value={i18n.language}
            onChange={e => {
              i18n.changeLanguage(e.target.value);
            }}
          >
            <option value="en">English</option>
            {languages.map(({ lang, autonym }) => (
              <option key={lang} value={lang}>
                {autonym}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>{t('intro.player-one')}</span>
          <input
            required
            type="text"
            defaultValue={nameOne}
            onChange={e => setNameOne(e.target.value)}
          />
        </label>

        <label>
          <span>{t('intro.player-two')}</span>
          <input
            required
            type="text"
            defaultValue={nameTwo}
            onChange={e => {
              setNameTwo(e.target.value);

              if (nameOne === e.target.value) {
                e.target.setCustomValidity(t('intro.player-identical'));
              } else {
                e.target.setCustomValidity('');
              }
            }}
          />
        </label>

        <button>{t('intro.start')}</button>
      </form>

      <div className="intro-footer">
        <p>
          <Trans i18nKey="intro.footer">
            This game was inspired by{' '}
            <a href="https://www.youtube.com/playlist?list=PLfx61sxf1Yz2I-c7eMRk9wBUUDCJkU7H0">
              Two Of These People Are Lying
            </a>{' '}
            by Tom Scott and Matt Grey.
          </Trans>
        </p>
      </div>
    </div>
  );
}

function Wrapper() {
  return (
    <Suspense fallback={<Loading />}>
      <App />
    </Suspense>
  );
}

export default Wrapper;
