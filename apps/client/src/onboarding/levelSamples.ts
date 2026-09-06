/**
 * Sample sentences for onboarding's "not sure?" helper (run 7 lane C).
 *
 * "Your level" is the one onboarding question a stranger cannot answer from a
 * label: A2 and B1 mean nothing to someone who has never sat a CEFR exam, and
 * the six one-line descriptions only rephrase the problem. The helper answers
 * it the way a bookshop does — here are sentences in the language you are
 * about to read; pick the hardest one you can follow.
 *
 * Three per level, deliberately short: this is a taste, not a passage, and it
 * has to be readable in a list row at 375. They are written here rather than
 * pulled from the packs because the packs do not carry a book at every level
 * for every language, and a helper that silently skips B2 for Catalan would
 * be worse than no helper.
 *
 * A language with no samples returns null and the helper is not offered at
 * all — English sentences shown to someone learning Romanian would make the
 * choice meaningless.
 */
import type { BookLevel } from '../ui/dev/fixtures';

export const LEVELS: readonly BookLevel[] = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1'] as const;

export type LevelSamples = Record<BookLevel, readonly string[]>;

const SAMPLES: Record<string, LevelSamples> = {
  en: {
    A0: ['The cat is black.', 'I have two brothers.', 'This is my house.'],
    A1: [
      'I go to work by bus every morning.',
      'She likes coffee, but she does not drink tea.',
      'We can meet at the station at six.',
    ],
    A2: [
      'When I was a child, we spent every summer by the sea.',
      'He said he would call me back after the meeting.',
      'The shop closes early on Sundays, so we should hurry.',
    ],
    B1: [
      'The letter arrived a week late, by which time she had already left.',
      'Although the weather was poor, the crossing went smoothly enough.',
      'He never explained why he had sold the farm.',
    ],
    B2: [
      'The proposal was rejected on grounds that had little to do with its merits.',
      'She had a way of ending an argument without ever conceding the point.',
      'What struck him was not the noise but the silence that followed it.',
    ],
    C1: [
      'The distinction, insofar as one can be drawn at all, rests on intent rather than outcome.',
      'He wrote with the studied carelessness of a man who had revised every line.',
      'Her account, though scrupulously accurate, contrived to leave the wrong impression.',
    ],
  },
  fr: {
    A0: ['Le chat est noir.', "J'ai deux frères.", 'Voici ma maison.'],
    A1: [
      'Je vais au travail en bus tous les matins.',
      'Elle aime le café, mais elle ne boit pas de thé.',
      'On peut se retrouver à la gare à six heures.',
    ],
    A2: [
      "Quand j'étais enfant, nous passions l'été au bord de la mer.",
      "Il a dit qu'il me rappellerait après la réunion.",
      'Le magasin ferme tôt le dimanche, alors dépêchons-nous.',
    ],
    B1: [
      'La lettre est arrivée avec une semaine de retard, et elle était déjà partie.',
      "Malgré le mauvais temps, la traversée s'est bien passée.",
      "Il n'a jamais expliqué pourquoi il avait vendu la ferme.",
    ],
    B2: [
      'La proposition a été rejetée pour des raisons qui tenaient peu à sa valeur.',
      'Elle savait mettre fin à une dispute sans jamais céder sur le fond.',
      'Ce qui le frappa, ce ne fut pas le bruit mais le silence qui suivit.',
    ],
    C1: [
      "La distinction, pour autant qu'on puisse en tracer une, tient à l'intention plutôt qu'au résultat.",
      "Il écrivait avec la négligence étudiée d'un homme qui avait repris chaque ligne.",
      "Son récit, d'une exactitude scrupuleuse, parvenait à donner une fausse impression.",
    ],
  },
  es: {
    A0: ['El gato es negro.', 'Tengo dos hermanos.', 'Esta es mi casa.'],
    A1: [
      'Voy al trabajo en autobús todas las mañanas.',
      'A ella le gusta el café, pero no toma té.',
      'Podemos vernos en la estación a las seis.',
    ],
    A2: [
      'Cuando era niño, pasábamos el verano junto al mar.',
      'Dijo que me llamaría después de la reunión.',
      'La tienda cierra temprano los domingos, así que apurémonos.',
    ],
    B1: [
      'La carta llegó con una semana de retraso, y para entonces ella ya se había ido.',
      'Aunque el tiempo estaba feo, la travesía salió bastante bien.',
      'Nunca explicó por qué había vendido la finca.',
    ],
    B2: [
      'La propuesta fue rechazada por razones que poco tenían que ver con su mérito.',
      'Ella sabía terminar una discusión sin ceder nunca en lo esencial.',
      'Lo que le impresionó no fue el ruido, sino el silencio que vino después.',
    ],
    C1: [
      'La distinción, en la medida en que pueda trazarse, depende de la intención y no del resultado.',
      'Escribía con el descuido estudiado de quien ha corregido cada línea.',
      'Su relato, de una exactitud escrupulosa, lograba dar una impresión equivocada.',
    ],
  },
  pt: {
    A0: ['O gato é preto.', 'Eu tenho dois irmãos.', 'Esta é a minha casa.'],
    A1: [
      'Vou para o trabalho de ônibus todas as manhãs.',
      'Ela gosta de café, mas não bebe chá.',
      'A gente pode se encontrar na estação às seis.',
    ],
    A2: [
      'Quando eu era criança, passávamos o verão à beira-mar.',
      'Ele disse que me ligaria depois da reunião.',
      'A loja fecha cedo aos domingos, então é melhor correr.',
    ],
    B1: [
      'A carta chegou com uma semana de atraso, e ela já tinha ido embora.',
      'Apesar do tempo ruim, a travessia correu bem.',
      'Ele nunca explicou por que tinha vendido a fazenda.',
    ],
    B2: [
      'A proposta foi rejeitada por razões que pouco tinham a ver com o seu mérito.',
      'Ela sabia encerrar uma discussão sem nunca ceder no essencial.',
      'O que o impressionou não foi o barulho, mas o silêncio que veio depois.',
    ],
    C1: [
      'A distinção, na medida em que se possa traçar alguma, depende da intenção e não do resultado.',
      'Escrevia com o descuido estudado de quem revisou cada linha.',
      'Seu relato, de uma exatidão escrupulosa, conseguia dar a impressão errada.',
    ],
  },
  it: {
    A0: ['Il gatto è nero.', 'Ho due fratelli.', 'Questa è la mia casa.'],
    A1: [
      'Vado al lavoro in autobus tutte le mattine.',
      'Le piace il caffè, ma non beve il tè.',
      'Possiamo vederci alla stazione alle sei.',
    ],
    A2: [
      "Quando ero bambino, passavamo l'estate al mare.",
      'Ha detto che mi avrebbe richiamato dopo la riunione.',
      'Il negozio chiude presto la domenica, quindi sbrighiamoci.',
    ],
    B1: [
      'La lettera arrivò con una settimana di ritardo, e lei era già partita.',
      'Nonostante il brutto tempo, la traversata andò bene.',
      'Non spiegò mai perché avesse venduto la fattoria.',
    ],
    B2: [
      'La proposta fu respinta per ragioni che avevano poco a che fare con il suo merito.',
      'Sapeva chiudere una discussione senza cedere mai sul punto.',
      'Ciò che lo colpì non fu il rumore, ma il silenzio che seguì.',
    ],
    C1: [
      "La distinzione, ammesso che se ne possa tracciare una, dipende dall'intenzione più che dall'esito.",
      'Scriveva con la studiata trascuratezza di chi ha riveduto ogni riga.',
      "Il suo resoconto, di scrupolosa esattezza, riusciva a dare l'impressione sbagliata.",
    ],
  },
  ro: {
    A0: ['Pisica este neagră.', 'Am doi frați.', 'Aceasta este casa mea.'],
    A1: [
      'Merg la muncă cu autobuzul în fiecare dimineață.',
      'Îi place cafeaua, dar nu bea ceai.',
      'Ne putem întâlni la gară la ora șase.',
    ],
    A2: [
      'Când eram copil, ne petreceam verile la mare.',
      'A spus că mă va suna după ședință.',
      'Magazinul se închide devreme duminica, așa că să ne grăbim.',
    ],
    B1: [
      'Scrisoarea a sosit cu o săptămână întârziere, iar ea plecase deja.',
      'În ciuda vremii urâte, traversarea a decurs bine.',
      'Nu a explicat niciodată de ce vânduse ferma.',
    ],
    B2: [
      'Propunerea a fost respinsă din motive care aveau puțin de-a face cu valoarea ei.',
      'Știa să încheie o ceartă fără să cedeze vreodată în esență.',
      'Ceea ce l-a frapat nu a fost zgomotul, ci liniștea care a urmat.',
    ],
    C1: [
      'Distincția, în măsura în care poate fi trasată, ține de intenție, nu de rezultat.',
      'Scria cu neglijența studiată a unui om care revizuise fiecare rând.',
      'Relatarea ei, de o exactitate scrupuloasă, reușea totuși să lase o impresie greșită.',
    ],
  },
  ca: {
    A0: ['El gat és negre.', 'Tinc dos germans.', 'Aquesta és casa meva.'],
    A1: [
      'Vaig a la feina en autobús cada matí.',
      'Li agrada el cafè, però no beu te.',
      "Ens podem trobar a l'estació a les sis.",
    ],
    A2: [
      'Quan era petit, passàvem l’estiu vora el mar.',
      'Va dir que em trucaria després de la reunió.',
      'La botiga tanca aviat els diumenges, així que afanyem-nos.',
    ],
    B1: [
      'La carta va arribar amb una setmana de retard, i ella ja havia marxat.',
      'Malgrat el mal temps, la travessia va anar bé.',
      'Mai no va explicar per què havia venut la masia.',
    ],
    B2: [
      'La proposta va ser rebutjada per raons que poc tenien a veure amb el seu mèrit.',
      'Sabia acabar una discussió sense cedir mai en el fons.',
      'El que el va colpir no va ser el soroll, sinó el silenci que el va seguir.',
    ],
    C1: [
      "La distinció, si és que se'n pot traçar cap, depèn de la intenció i no del resultat.",
      'Escrivia amb la descurança estudiada de qui ha revisat cada línia.',
      "El seu relat, d'una exactitud escrupolosa, aconseguia donar una impressió equivocada.",
    ],
  },
  'zh-CN': {
    A0: ['猫是黑色的。', '我有两个哥哥。', '这是我的家。'],
    A1: ['我每天早上坐公交车上班。', '她喜欢咖啡，但是不喝茶。', '我们六点在车站见面吧。'],
    A2: [
      '我小时候，每年夏天都在海边过。',
      '他说开完会以后给我回电话。',
      '商店星期天关门早，我们快一点吧。',
    ],
    B1: [
      '信晚了一个星期才到，那时候她已经走了。',
      '尽管天气不好，这次航行还算顺利。',
      '他从来没有解释过为什么把农场卖掉了。',
    ],
    B2: [
      '这项提议被否决了，理由却与它本身的好坏关系不大。',
      '她总能结束一场争论，却从不在关键处让步。',
      '让他吃惊的不是那阵声响，而是随之而来的寂静。',
    ],
    C1: [
      '所谓区别，若真能划出一条界线，也在于动机而非结果。',
      '他写得看似随意，其实每一行都反复推敲过。',
      '她的叙述字字确凿，却偏偏留下了错误的印象。',
    ],
  },
  'zh-TW': {
    A0: ['貓是黑色的。', '我有兩個哥哥。', '這是我的家。'],
    A1: ['我每天早上坐公車上班。', '她喜歡咖啡，但是不喝茶。', '我們六點在車站見面吧。'],
    A2: [
      '我小時候，每年夏天都在海邊過。',
      '他說開完會以後給我回電話。',
      '商店星期天關門早，我們快一點吧。',
    ],
    B1: [
      '信晚了一個星期才到，那時候她已經走了。',
      '儘管天氣不好，這次航行還算順利。',
      '他從來沒有解釋過為什麼把農場賣掉了。',
    ],
    B2: [
      '這項提議被否決了，理由卻與它本身的好壞關係不大。',
      '她總能結束一場爭論，卻從不在關鍵處讓步。',
      '讓他吃驚的不是那陣聲響，而是隨之而來的寂靜。',
    ],
    C1: [
      '所謂區別，若真能劃出一條界線，也在於動機而非結果。',
      '他寫得看似隨意，其實每一行都反覆推敲過。',
      '她的敘述字字確鑿，卻偏偏留下了錯誤的印象。',
    ],
  },
};

/**
 * Samples for a content locale (`fr-FR`, `es-419`, `zh-TW`), or null when
 * there are none. Regional variants share a set — the sentences are graded
 * examples, not a dialect lesson — but the two Chinese scripts do not, since
 * the script is the whole point of that choice.
 */
export function levelSamplesFor(locale: string): LevelSamples | null {
  if (!locale) return null;
  if (locale.toLowerCase().startsWith('zh')) {
    const traditional =
      locale.toLowerCase().includes('hant') || /-(tw|hk|mo)$/i.test(locale) ? 'zh-TW' : 'zh-CN';
    return SAMPLES[traditional] ?? null;
  }
  const primary = locale.split('-')[0]?.toLowerCase() ?? '';
  return SAMPLES[primary] ?? null;
}
